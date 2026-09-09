/**
 * Pass 1 of the two-pass insights pipeline: verbatim-grounded fact extraction.
 *
 * Single-shot summarization produced fluent but wrong output on real sales
 * calls: the fixture meeting's summary led with "lead acquisition challenges"
 * when the prospect explicitly said "I don't need more customers", and every
 * hard number ($5M TTV, $20K average booking, 400 clients) was dropped.
 *
 * The fix: an extraction pass reads the diarized transcript and emits a
 * `facts` object where every item carries a verbatim `quote` and a `ts`.
 * Synthesis (pass 2, in insights.ts) then writes prose from the facts object,
 * and a cheap validation pass (pass 3, here) checks the synthesized claims
 * against the quotes, flagging anything unsupported instead of shipping it
 * silently.
 *
 * Every model output goes through a whitelist normalizer — JSON mode
 * volunteers fields you removed from the prompt (observed 2026-08-20).
 */
import OpenAI from "https://esm.sh/openai@4.20.1";
import { AnchorSegment, anchorFacts, formatLabeledTranscript } from "./anchor.ts";

export const MEETING_TYPES = [
  "sales_discovery",
  "sales_proposal",
  "coaching",
  "internal_sync",
  "client_checkin",
  "other",
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export interface FactQuote {
  quote: string;
  ts: number;
  speaker?: string | null;
}

export interface MeetingFacts {
  meeting_type: MeetingType;
  topics: Array<{ topic: string; ts: number; notes: string }>;
  numbers: Array<{ metric: string; value: string; speaker: string | null; quote: string; ts: number }>;
  entities: Array<{ type: string; name: string; context: string; ts: number }>;
  pain_points: Array<{ statement: string; speaker: string | null; quote: string; ts: number }>;
  objections: Array<{
    statement: string;
    speaker: string | null;
    quote: string;
    ts: number;
    addressed: boolean;
    how_addressed_ts: number | null;
  }>;
  buying_signals: Array<{ statement: string; quote: string; ts: number }>;
  explicit_asks: Array<{ statement: string; quote: string; ts: number }>;
  commitments: Array<{ who: string | null; what: string; due: string | null; quote: string; ts: number }>;
  decisions: Array<{ decision: string; owner: string | null; quote: string; ts: number }>;
  risks: Array<{ statement: string; ts: number }>;
  open_questions: string[];
  notable_quotes: Array<{ speaker: string; quote: string; ts: number; why: string }>;
  validation?: { unverified: string[]; grounding_rate: number };
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function strOrNull(v: unknown): string | null {
  if (v == null || v === "null") return null;
  const s = String(v).trim();
  return s || null;
}

function ts(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    : [];
}

/** Whitelist-coerce the model's JSON into MeetingFacts. Drops empty rows. */
export function normalizeFacts(raw: Record<string, unknown>): MeetingFacts {
  const meetingTypeRaw = str(raw.meeting_type);
  return {
    meeting_type: (MEETING_TYPES as readonly string[]).includes(meetingTypeRaw)
      ? (meetingTypeRaw as MeetingType)
      : "other",
    topics: arr(raw.topics)
      .map((t) => ({ topic: str(t.topic), ts: ts(t.ts), notes: str(t.notes) }))
      .filter((t) => t.topic)
      .slice(0, 12),
    numbers: arr(raw.numbers)
      .map((n) => ({
        metric: str(n.metric),
        value: str(n.value),
        speaker: strOrNull(n.speaker),
        quote: str(n.quote),
        ts: ts(n.ts),
      }))
      .filter((n) => n.metric && n.value)
      .slice(0, 20),
    entities: arr(raw.entities)
      .map((e) => ({ type: str(e.type), name: str(e.name), context: str(e.context), ts: ts(e.ts) }))
      .filter((e) => e.name)
      .slice(0, 15),
    pain_points: arr(raw.pain_points)
      .map((p) => ({
        statement: str(p.statement),
        speaker: strOrNull(p.speaker),
        quote: str(p.quote),
        ts: ts(p.ts),
      }))
      .filter((p) => p.statement)
      .slice(0, 10),
    objections: arr(raw.objections)
      .map((o) => ({
        statement: str(o.statement),
        speaker: strOrNull(o.speaker),
        quote: str(o.quote),
        ts: ts(o.ts),
        addressed: o.addressed === true,
        how_addressed_ts: o.how_addressed_ts == null ? null : ts(o.how_addressed_ts),
      }))
      .filter((o) => o.statement)
      .slice(0, 10),
    buying_signals: arr(raw.buying_signals)
      .map((b) => ({ statement: str(b.statement), quote: str(b.quote), ts: ts(b.ts) }))
      .filter((b) => b.statement)
      .slice(0, 10),
    explicit_asks: arr(raw.explicit_asks)
      .map((a) => ({ statement: str(a.statement), quote: str(a.quote), ts: ts(a.ts) }))
      .filter((a) => a.statement)
      .slice(0, 10),
    commitments: arr(raw.commitments)
      .map((c) => ({
        who: strOrNull(c.who),
        what: str(c.what),
        due: strOrNull(c.due),
        quote: str(c.quote),
        ts: ts(c.ts),
      }))
      .filter((c) => c.what)
      .slice(0, 15),
    decisions: arr(raw.decisions)
      .map((d) => ({
        decision: str(d.decision),
        owner: strOrNull(d.owner),
        quote: str(d.quote),
        ts: ts(d.ts),
      }))
      .filter((d) => d.decision)
      .slice(0, 10),
    risks: arr(raw.risks)
      .map((r) => ({ statement: str(r.statement), ts: ts(r.ts) }))
      .filter((r) => r.statement)
      .slice(0, 8),
    open_questions: (Array.isArray(raw.open_questions) ? raw.open_questions : [])
      .map((q) => str(q))
      .filter(Boolean)
      .slice(0, 8),
    notable_quotes: arr(raw.notable_quotes)
      .map((q) => ({ speaker: str(q.speaker), quote: str(q.quote), ts: ts(q.ts), why: str(q.why) }))
      .filter((q) => q.speaker && q.quote)
      .slice(0, 8),
  };
}

/**
 * One extraction call over one stretch of transcript.
 *
 * `windowNote` tells the model that it is reading a slice of a longer meeting,
 * which stops it from writing a report-shaped set of topics for a ten-minute
 * excerpt. It never affects the JSON shape.
 */
async function extractFactsWindow(
  openai: OpenAI,
  meeting: Record<string, unknown>,
  labeledTranscript: string,
  vocabulary: string[] = [],
  windowNote = "",
): Promise<MeetingFacts> {
  const vocabLine = vocabulary.length > 0
    ? `\nCanonical spellings (always use exactly these): ${vocabulary.join(", ")}`
    : "";

  const prompt = `Extract structured facts from this meeting transcript. You are the extraction pass of a two-pass pipeline: a later pass writes the report from YOUR output only, so anything you omit is lost. Every item MUST carry a verbatim quote from the transcript and a ts (seconds, copied from the nearest [mm:ss] marker converted to seconds).

MEETING: ${str(meeting.title)}${vocabLine}${windowNote}

TRANSCRIPT (each line is [mm:ss] Speaker: speech):
${labeledTranscript}

RULES
- quote is VERBATIM from the transcript — never paraphrase inside quote.
- Capture EVERY hard number spoken (money, volumes, percentages, counts, rates). Numbers are the single most valuable output. Before finishing, re-scan the transcript for digits and add any number you missed — comparative pairs count as separate numbers ("converts at 3%" AND "referrals book at 85-90%").
- An objection is explicit pushback ("I don't need X", "that won't work for me"). Record whether it was later addressed and where.
- A commitment is a person agreeing to do a concrete thing — from EITHER side. Agreeing to attend a follow-up, review a proposal, or send materials all count. due is the time AS SPOKEN ("Tuesday"), or null.
- explicit_asks: when the customer says what they DO want ("what I do need is..."), capture it in their words — this is the single most important sentence of a sales call.
- A decision is explicit agreement, not "we should maybe".
- explicit_asks are what the customer/other party SAID they want, in their words.
- meeting_type: sales_discovery (qualifying a prospect), sales_proposal, coaching, internal_sync (only same-company attendees / operational), client_checkin, other.
- topics: ${windowNote ? "1-3" : "4-10"} chapter headings in order with 1-2 sentence notes each${windowNote ? ", covering ONLY this excerpt" : ""}.
- ts is ALWAYS seconds from the start of the WHOLE meeting, read off the [mm:ss] marker on the line you quoted — [42:07] is 2527, never 42. Copy the marker; never estimate.
- Empty arrays are correct when the meeting has none of that. Never invent.

JSON shape:
{
  "meeting_type": "sales_discovery|sales_proposal|coaching|internal_sync|client_checkin|other",
  "topics": [{"topic": "", "ts": 0, "notes": ""}],
  "numbers": [{"metric": "annual TTV", "value": "$5M", "speaker": "Name", "quote": "", "ts": 0}],
  "entities": [{"type": "tool|company|person|product", "name": "", "context": "", "ts": 0}],
  "pain_points": [{"statement": "", "speaker": "Name or null", "quote": "", "ts": 0}],
  "objections": [{"statement": "", "speaker": "Name or null", "quote": "", "ts": 0, "addressed": false, "how_addressed_ts": null}],
  "buying_signals": [{"statement": "", "quote": "", "ts": 0}],
  "explicit_asks": [{"statement": "", "quote": "", "ts": 0}],
  "commitments": [{"who": "Name or null", "what": "", "due": "as spoken or null", "quote": "", "ts": 0}],
  "decisions": [{"decision": "", "owner": "Name or null", "quote": "", "ts": 0}],
  "risks": [{"statement": "", "ts": 0}],
  "open_questions": [""],
  "notable_quotes": [{"speaker": "", "quote": "", "ts": 0, "why": ""}]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "You are a meticulous meeting analyst. You extract only what was actually said, with verbatim quotes and timestamps. You never invent facts, names, numbers, or commitments. Always respond with valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0]?.message?.content || "{}";
  return normalizeFacts(JSON.parse(text));
}

/**
 * How much transcript one extraction call reads. Ten minutes keeps every window
 * comfortably inside the model's reliable-attention span; the failure it exists
 * to prevent is a single pass over an hour of speech, which returns facts drawn
 * from the whole meeting but timestamps drawn from the first few minutes.
 */
export const EXTRACTION_WINDOW_SECONDS = 600;

/** Below this a single pass is both cheaper and better — no seam to merge across. */
const WINDOW_MIN_DURATION_SECONDS = 900;

/** Windows in flight at once. The edge function has one CPU and a wall clock. */
const WINDOW_CONCURRENCY = 4;

/** Per-key caps, applied again after merging windows. Mirrors normalizeFacts. */
const MERGE_CAPS: Record<string, number> = {
  topics: 14,
  numbers: 20,
  entities: 15,
  pain_points: 10,
  objections: 10,
  buying_signals: 10,
  explicit_asks: 10,
  commitments: 15,
  decisions: 10,
  risks: 8,
  open_questions: 8,
  notable_quotes: 8,
};

/** Keep `cap` items spread across the list, not the first `cap` of them. */
export function evenSample<T>(rows: T[], cap: number): T[] {
  if (rows.length <= cap) return rows;
  const step = rows.length / cap;
  const out: T[] = [];
  for (let i = 0; i < cap; i += 1) out.push(rows[Math.floor(i * step)]);
  return out;
}

function dedupeKey(key: string, row: Record<string, unknown>): string {
  const parts = key === "numbers"
    ? [row.metric, row.value]
    : key === "topics"
    ? [row.topic]
    : key === "entities"
    ? [row.name]
    : [row.quote || row.statement || row.decision || row.what || row.topic];
  return parts
    .map((p) => String(p ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""))
    .join("|");
}

/** Cut the segments into fixed-length windows of meeting time. */
export function windowSegments(
  segments: AnchorSegment[],
  windowSeconds = EXTRACTION_WINDOW_SECONDS,
): Array<{ from: number; to: number; segments: AnchorSegment[] }> {
  const timed = (Array.isArray(segments) ? segments : []).filter((s) =>
    Number.isFinite(Number(s?.start))
  );
  if (timed.length === 0) return [];
  const last = timed.reduce(
    (max, s) => Math.max(max, Number(s.end ?? s.start ?? 0)),
    0,
  );
  const windows: Array<{ from: number; to: number; segments: AnchorSegment[] }> = [];
  for (let from = 0; from < last; from += windowSeconds) {
    const to = from + windowSeconds;
    const inWindow = timed.filter((s) => {
      const start = Number(s.start);
      return start >= from && start < to;
    });
    if (inWindow.length > 0) windows.push({ from, to, segments: inWindow });
  }
  return windows;
}

/**
 * Fold per-window facts into one object: concatenate, drop duplicates (a topic
 * or number can legitimately be extracted twice when a window boundary falls
 * mid-discussion), order by time, and re-apply the caps.
 */
export function mergeFacts(parts: MeetingFacts[]): MeetingFacts {
  const usable = parts.filter(Boolean);
  if (usable.length === 0) return normalizeFacts({});
  if (usable.length === 1) return usable[0];

  const merged: Record<string, unknown> = { meeting_type: "other" };

  // The type of the meeting is a property of the whole call, so let the windows
  // vote and ignore the ones that could not tell.
  const votes = new Map<string, number>();
  for (const p of usable) {
    if (p.meeting_type && p.meeting_type !== "other") {
      votes.set(p.meeting_type, (votes.get(p.meeting_type) ?? 0) + 1);
    }
  }
  merged.meeting_type = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    usable[0].meeting_type;

  for (const key of Object.keys(MERGE_CAPS)) {
    if (key === "open_questions") {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const p of usable) {
        for (const q of (p.open_questions ?? [])) {
          const k = q.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!k || seen.has(k)) continue;
          seen.add(k);
          out.push(q);
        }
      }
      merged.open_questions = out.slice(0, MERGE_CAPS[key]);
      continue;
    }

    const seen = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (const p of usable) {
      const list = (p as unknown as Record<string, unknown>)[key];
      if (!Array.isArray(list)) continue;
      for (const row of list as Record<string, unknown>[]) {
        const k = dedupeKey(key, row);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        rows.push(row);
      }
    }
    rows.sort((a, b) => Number(a.ts ?? 0) - Number(b.ts ?? 0));
    // Trimming to the cap by taking the first N would hand the whole allowance
    // to the opening windows and leave an hour-long meeting with chapters that
    // stop at minute 46 — the exact failure this rewrite exists to end. Sample
    // evenly instead, so the survivors still span the meeting.
    merged[key] = evenSample(rows, MERGE_CAPS[key]);
  }

  return normalizeFacts(merged);
}

async function pooled<T, R>(
  items: T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await run(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Pass 1: the facts object for one meeting.
 *
 * With `segments`, a meeting longer than {@link WINDOW_MIN_DURATION_SECONDS} is
 * extracted a window at a time and every fact is anchored back onto the segment
 * its quote came from. Without them (older callers, transcripts with no
 * diarization) this is the original single call, unchanged.
 */
export async function extractFacts(
  openai: OpenAI,
  meeting: Record<string, unknown>,
  labeledTranscript: string,
  vocabulary: string[] = [],
  segments: AnchorSegment[] = [],
): Promise<MeetingFacts> {
  const windows = windowSegments(segments);
  const duration = windows.length > 0 ? windows[windows.length - 1].to : 0;

  if (windows.length < 2 || duration < WINDOW_MIN_DURATION_SECONDS) {
    const facts = await extractFactsWindow(openai, meeting, labeledTranscript, vocabulary);
    return segments.length > 0 ? anchorFacts(facts, segments) : facts;
  }

  const total = windows.length;
  const parts = await pooled(windows, WINDOW_CONCURRENCY, async (w, i) => {
    const note =
      `\nThis is excerpt ${i + 1} of ${total} from a longer meeting, covering ${
        Math.round(w.from / 60)
      }-${Math.round(w.to / 60)} minutes. Extract only what this excerpt contains.`;
    try {
      const facts = await extractFactsWindow(
        openai,
        meeting,
        formatLabeledTranscript(w.segments, ""),
        vocabulary,
        note,
      );
      return anchorFacts(facts, segments, { from: w.from, to: w.to });
    } catch (err) {
      // One bad window must not cost the meeting its other fifty minutes.
      console.warn(
        `[extractFacts] window ${i + 1}/${total} failed:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  });

  const usable = parts.filter((p): p is MeetingFacts => p !== null);
  if (usable.length === 0) {
    const facts = await extractFactsWindow(openai, meeting, labeledTranscript, vocabulary);
    return anchorFacts(facts, segments);
  }
  return mergeFacts(usable);
}

/**
 * Pass 3: grounding check. Each synthesized claim is tested against the facts
 * object; claims that fail come back in `unverified` and are stored with the
 * facts so the UI can badge them instead of shipping them as truth.
 */
export async function validateInsights(
  openai: OpenAI,
  facts: MeetingFacts,
  insights: Record<string, unknown>,
): Promise<{ unverified: string[]; grounding_rate: number }> {
  const claims: string[] = [
    ...String(insights.summary_short ?? "").split(/(?<=[.!?])\s+/),
    ...((insights.key_points as string[]) ?? []),
  ]
    .map((c) => c.trim())
    .filter((c) => c.length > 15)
    .slice(0, 25);

  if (claims.length === 0) return { unverified: [], grounding_rate: 1 };

  const { validation: _drop, ...factsForJudge } = facts;
  const prompt = `You are auditing a meeting summary for grounding. For each claim, decide whether it is supported by the extracted facts below (quotes are verbatim from the transcript). A claim is SUPPORTED if the facts substantiate its core assertion; incidental wording differences are fine. A claim is UNSUPPORTED if it asserts something the facts do not contain, or contradicts them.

FACTS:
${JSON.stringify(factsForJudge)}

CLAIMS (numbered):
${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Respond with JSON: {"unsupported": [list of claim numbers that are UNSUPPORTED]}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const unsupported: number[] = Array.isArray(raw.unsupported)
    ? raw.unsupported.map(Number).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= claims.length)
    : [];
  const unverified = unsupported.map((n) => claims[n - 1]);
  const grounding = claims.length > 0 ? (claims.length - unverified.length) / claims.length : 1;
  return { unverified, grounding_rate: Math.round(grounding * 100) / 100 };
}
