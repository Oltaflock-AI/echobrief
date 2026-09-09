import OpenAI from "https://esm.sh/openai@4.20.1";
import { resolveAllowlistedRecipients } from "./summary-recipients.ts";
// The labeled-transcript formatter lives in anchor.ts, so facts.ts can use it
// without importing this module back (that would be a cycle).
import { formatClock, formatLabeledTranscript } from "./anchor.ts";
import {
  extractFacts,
  MeetingFacts,
  validateInsights,
} from "./facts.ts";
import { resolveRelativeDate } from "./dates.ts";

export interface SpeakerSegment {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
  speaker_id?: string;
}

// A looping hallucination ("you you you…", one sentence repeated for an hour)
// never has more than a handful of distinct words, however long it runs.
const MAX_LOOP_VOCABULARY = 50;

export function isLikelyHallucination(text: string): boolean {
  if (!text || text.trim().length === 0) return true;

  const words = text.trim().toLowerCase().split(/\s+/);
  if (words.length === 0) return true;

  const uniqueWords = new Set(words);
  const uniqueRatio = uniqueWords.size / words.length;

  // Degenerate repetition. A bare ratio threshold is wrong for long text:
  // vocabulary grows sub-linearly with length (Heaps' law), so a real
  // 10,000-word conversation has ~1,500 distinct words — a ratio near 0.15 —
  // and that is exactly how a genuine 60-minute call was discarded on
  // 2026-08-31. Require the tiny ABSOLUTE vocabulary of a loop as well.
  // tests/hallucination_test.ts holds both shapes.
  if (words.length >= 5 && uniqueRatio < 0.2 && uniqueWords.size < MAX_LOOP_VOCABULARY) return true;

  const cleaned = text.trim().toLowerCase().replace(/[.,!?]/g, "");
  const patterns = [
    /^(\s*you\s*)+$/,
    /^(\s*thank you\s*)+$/,
    /^(\s*thanks for watching\s*)+$/,
    /^(\s*please subscribe\s*)+$/,
    /^(\s*bye\s*)+$/,
    /^(\s*so\s*)+$/,
    /^(\s*um\s*)+$/,
    /^(\s*uh\s*)+$/,
    /^(\s*oh\s*)+$/,
    /^(\s*okay\s*)+$/,
  ];
  if (patterns.some((p) => p.test(cleaned))) return true;

  return false;
}

function emptyInsights() {
  return {
    summary_short:
      "No clear speech was detected in this recording. This usually means the meeting audio was too quiet, the microphone was muted, or the recording only captured silence. Try ensuring your microphone is unmuted and meeting participants are audible.",
    summary_detailed: "",
    strategic_insights: [],
    speaker_highlights: [],
    key_points: [],
    action_items: [],
    decisions: [],
    risks: [],
    open_questions: [],
    follow_ups: [],
    timeline_entries: [],
    meeting_metrics: { sentiment_score: 0 },
  };
}

// Re-exported because every call site has always imported it from here.
export { formatClock, formatLabeledTranscript };

/**
 * A timeline or action-item timestamp, in seconds.
 *
 * This used to snap the number onto the nearest real segment start, which
 * looked like precision and was the opposite: the facts pipeline now anchors
 * every timestamp onto the segment its quote came from, so a value arriving
 * here is already exact and snapping is a no-op — while on the legacy
 * single-shot path it took a number the model invented and rounded it onto a
 * real utterance, making a fabrication indistinguishable from a measurement.
 * A number we cannot verify is passed through as the estimate it is.
 * See _shared/anchor.ts.
 */
export function coerceTimestamp(raw: unknown): number {
  const t = Number(raw);
  return Number.isFinite(t) && t >= 0 ? Math.round(t) : 0;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "insight" in (item as object)) {
        return String((item as { insight?: unknown }).insight ?? "").trim();
      }
      return String(item ?? "").trim();
    })
    .filter(Boolean);
}

function flattenDecision(d: unknown): string {
  if (typeof d === "string") return d.trim();
  if (d && typeof d === "object" && "decision" in d) {
    const obj = d as { decision?: unknown; owner?: unknown; context?: unknown };
    const owner = obj.owner ? ` (${obj.owner})` : "";
    const context = obj.context ? ` — ${obj.context}` : "";
    return `${obj.decision ?? ""}${owner}${context}`.trim();
  }
  return String(d ?? "").trim();
}

/**
 * summary_detailed must end up a string. Asked for "notes grouped by topic",
 * JSON mode sometimes returns an object or array instead — which String()
 * turns into the literal "[object Object]" (observed in prod 2026-08-31).
 */
export function flattenSummaryDetailed(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((v) => flattenSummaryDetailed(v)).filter(Boolean).join("\n\n");
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // {topic: "...", notes: "..."} shaped entry
    if (typeof obj.topic === "string" && obj.notes !== undefined) {
      return `${obj.topic}: ${flattenSummaryDetailed(obj.notes)}`.trim();
    }
    // {"Topic A": "notes", "Topic B": [...]} shaped map
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${flattenSummaryDetailed(v)}`.trim())
      .filter((s) => s.length > 2)
      .join("\n\n");
  }
  return "";
}

const PRIORITIES = new Set(["high", "medium", "low"]);

function normalizeActionItem(item: unknown): Record<string, unknown> | null {
  if (typeof item === "string") {
    const task = item.trim();
    return task ? { task } : null;
  }
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const task = String(raw.task ?? "").trim();
  if (!task) return null;
  const owner = raw.owner == null || raw.owner === "null" ? null : String(raw.owner).trim() || null;
  const priority = String(raw.priority ?? "").toLowerCase();
  const confidence = String(raw.confidence ?? "").toLowerCase();
  const due = raw.due_date == null || raw.due_date === "null"
    ? null
    : String(raw.due_date).trim() || null;
  const outcome = raw.outcome == null ? null : String(raw.outcome).trim() || null;
  const ts = Number(raw.source_timestamp);
  return {
    task,
    owner,
    priority: PRIORITIES.has(priority) ? priority : "medium",
    confidence: PRIORITIES.has(confidence) ? confidence : "medium",
    ...(due ? { due_date: due } : {}),
    ...(outcome ? { outcome } : {}),
    ...(Number.isFinite(ts) && ts >= 0 ? { source_timestamp: ts } : {}),
  };
}

/**
 * Coerce the model's JSON into the shape the rest of the pipeline stores.
 * Drops empty rows and never lets a guessed talk-time object through —
 * metrics are merged later. Timestamps arrive anchored (see facts.ts) and are
 * carried through unchanged.
 */
export function normalizeInsights(
  raw: Record<string, unknown>,
  segments: SpeakerSegment[],
): Record<string, unknown> {
  const actionItems = Array.isArray(raw.action_items)
    ? (raw.action_items.map(normalizeActionItem).filter(Boolean) as Record<string, unknown>[])
      .map((item) =>
        typeof item.source_timestamp === "number"
          ? { ...item, source_timestamp: coerceTimestamp(item.source_timestamp) }
          : item
      )
    : [];

  const timeline = Array.isArray(raw.timeline_entries)
    ? raw.timeline_entries
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const e = entry as Record<string, unknown>;
        const content = String(e.content ?? "").trim();
        if (!content) return null;
        const type = String(e.type ?? "topic");
        const speaker = e.speaker == null || e.speaker === "null"
          ? null
          : String(e.speaker).trim() || null;
        return {
          timestamp: coerceTimestamp(e.timestamp),
          type: ["topic", "question", "decision", "action", "risk"].includes(type)
            ? type
            : "topic",
          content,
          speaker,
        };
      })
      .filter(Boolean)
      .slice(0, 12)
    : [];

  const highlights = Array.isArray(raw.speaker_highlights)
    ? raw.speaker_highlights
      .map((h) => {
        if (!h || typeof h !== "object") return null;
        const o = h as Record<string, unknown>;
        const highlight = String(o.highlight ?? "").trim();
        const speaker = String(o.speaker ?? "").trim();
        if (!highlight || !speaker) return null;
        return {
          speaker,
          highlight,
          context: String(o.context ?? "").trim(),
        };
      })
      .filter(Boolean)
      .slice(0, 8)
    : [];

  const strategic = Array.isArray(raw.strategic_insights)
    ? raw.strategic_insights
      .map((s) => {
        if (!s || typeof s !== "object") return null;
        const o = s as Record<string, unknown>;
        const insight = String(o.insight ?? "").trim();
        if (!insight) return null;
        const category = String(o.category ?? "process");
        return {
          insight,
          category: ["market", "risk", "opportunity", "process"].includes(category)
            ? category
            : "process",
        };
      })
      .filter(Boolean)
      .slice(0, 5)
    : [];

  const followUps = Array.isArray(raw.follow_ups)
    ? raw.follow_ups
      .map((f) => {
        if (typeof f === "string") {
          const description = f.trim();
          return description ? { description, assignee: null, type: "research" } : null;
        }
        if (!f || typeof f !== "object") return null;
        const o = f as Record<string, unknown>;
        const description = String(o.description ?? "").trim();
        if (!description) return null;
        const type = String(o.type ?? "research");
        return {
          description,
          assignee: o.assignee == null || o.assignee === "null"
            ? null
            : String(o.assignee).trim() || null,
          type: ["meeting", "research", "validation"].includes(type) ? type : "research",
        };
      })
      .filter(Boolean)
    : [];

  const sentimentRaw = Number(
    (raw.meeting_metrics as { sentiment_score?: unknown } | undefined)?.sentiment_score,
  );
  const sentiment = Number.isFinite(sentimentRaw)
    ? Math.max(-1, Math.min(1, sentimentRaw))
    : undefined;

  return {
    summary_short: String(raw.summary_short ?? "").trim(),
    summary_detailed: flattenSummaryDetailed(raw.summary_detailed),
    strategic_insights: strategic,
    speaker_highlights: highlights,
    key_points: asStringArray(raw.key_points).slice(0, 10),
    action_items: actionItems,
    decisions: (Array.isArray(raw.decisions) ? raw.decisions : [])
      .map(flattenDecision)
      .filter(Boolean),
    risks: asStringArray(raw.risks),
    open_questions: asStringArray(raw.open_questions),
    follow_ups: followUps,
    timeline_entries: timeline,
    meeting_metrics: sentiment === undefined ? {} : { sentiment_score: sentiment },
  };
}

/**
 * Attach resolved calendar dates to action items whose due_date was spoken
 * as a relative phrase. "Tuesday" (said Fri Aug 28) → due_date_resolved
 * "2026-09-01"; "next week" → due_date_range. The raw phrase is always kept.
 */
export function resolveActionItemDates(
  insights: Record<string, any>,
  meetingStartISO: string | null | undefined,
): void {
  if (!Array.isArray(insights.action_items)) return;
  insights.action_items = insights.action_items.map((item: Record<string, unknown>) => {
    const due = typeof item.due_date === "string" ? item.due_date : null;
    if (!due) return item;
    const resolved = resolveRelativeDate(due, meetingStartISO);
    if (!resolved) return item;
    return {
      ...item,
      ...(resolved.date ? { due_date_resolved: resolved.date } : {}),
      ...(resolved.range ? { due_date_range: resolved.range } : {}),
    };
  });
}

/**
 * Pass 2: synthesis. Receives ONLY the facts object — not the transcript —
 * so every sentence it writes is traceable to an extracted, quoted fact.
 */
export type SummaryLanguage = "en" | "hi";

/**
 * The output-language clause appended to both synthesis prompts.
 *
 * Only the prose fields are translated. Action items and decisions are
 * assembled from verbatim quoted facts elsewhere in this module, so they stay
 * in the language they were spoken in — translating a quote would stop it being
 * one. Names, company and product names and numerals stay as written so entity
 * correction and the numbers-recall eval still line up.
 */
export function summaryLanguageRule(language: SummaryLanguage | undefined): string {
  if (language !== "hi") return "";
  return `
- OUTPUT LANGUAGE: write summary_short, summary_detailed, key_points, strategic_insights and follow_up descriptions in HINDI (Devanagari script). Keep person names, company names, product names, URLs and all numerals exactly as they appear in the facts — do not transliterate or convert them. Every other field keeps its English key names and enum values.`;
}

async function synthesizeFromFacts(
  openai: OpenAI,
  meeting: Record<string, any>,
  facts: MeetingFacts,
  summaryLanguage?: SummaryLanguage,
): Promise<Record<string, unknown>> {
  const durationLine = Number.isFinite(Number(meeting.duration_seconds))
    ? ` (${Math.round(Number(meeting.duration_seconds) / 60)} minutes)`
    : "";

  const templateHints: Record<string, string> = {
    sales_discovery:
      "Discovery call: cover prospect profile, pain points, buying signals, the numbers, objections and the agreed next step. Lead with what the prospect SAID they need.",
    sales_proposal:
      "Proposal call: cover what was proposed, the reaction per item, pricing discussion, objections and close status.",
    coaching:
      "Coaching call: cover advice given, commitments made and exercises assigned.",
    internal_sync:
      "Internal sync: decisions, blockers and owner-tagged commitments only. Keep prose minimal — nobody reads padding about their own standup.",
    client_checkin:
      "Client check-in: cover status, concerns raised, commitments both ways and the next touchpoint.",
    other: "General meeting notes.",
  };

  const prompt = `Write the meeting report from these extracted facts. You do NOT have the transcript — the facts object (verbatim quotes + timestamps) is your only source, so never add information that is not in it.

MEETING: ${meeting.title}${durationLine}
MEETING TYPE: ${facts.meeting_type} — ${templateHints[facts.meeting_type] ?? templateHints.other}

FACTS:
${JSON.stringify(facts)}

RULES
- Every sentence must be traceable to at least one fact. No market commentary, no invented strategy.
- key_points MUST include every item from "numbers" (metric + value) and every item from "explicit_asks". These are never summarized away — they are what the reader needs for the follow-up.
- If "objections" contradicts an easy framing (e.g. the prospect explicitly rejects lead generation), the summary MUST lead with the other party's actual stated need, not the pitch.
- summary_short: 3–5 sentences. Why this meeting, what changed, what happens next.
- summary_detailed: ONE STRING (never an object/array) — notes grouped by topic as paragraphs (use "topics" for structure, enrich from the other facts), with speaker names where the facts carry them.
- key_points are written as readable sentences that carry the numbers ("Doing $5M TTV a year across 400 clients"), never bare "metric: value" pairs.
- strategic_insights: at most 3, only if the facts support an implication. Empty for operational meetings.
- follow_ups: from commitments that need future contact (meetings, sending things). assignee from the commitment's "who".
- sentiment_score: overall tone from -1 (tense) to 1 (warm). Neutral is ~0.${summaryLanguageRule(summaryLanguage)}

JSON shape:
{
  "summary_short": "",
  "summary_detailed": "",
  "key_points": [""],
  "strategic_insights": [{"insight": "", "category": "market|risk|opportunity|process"}],
  "follow_ups": [{"description": "", "assignee": "Name or null", "type": "meeting|research|validation"}],
  "meeting_metrics": {"sentiment_score": 0}
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 2048,
    messages: [
      {
        role: "system",
        content:
          "You write meeting reports strictly from provided structured facts. You never add information that is not in the facts. Always respond with valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(completion.choices[0]?.message?.content || "{}");
}

/**
 * Deterministic assembly: everything that CAN come straight from quoted facts
 * does — action items from commitments, decisions from decisions, timeline
 * from topics, highlights from notable quotes — leaving the model responsible
 * only for prose. The combined raw object then rides through the same
 * normalizeInsights whitelist as the legacy path.
 */
function assembleInsights(
  facts: MeetingFacts,
  synth: Record<string, unknown>,
  segments: SpeakerSegment[],
): Record<string, unknown> {
  const timeline = [
    ...facts.topics.map((t) => ({
      timestamp: t.ts,
      type: "topic",
      content: t.topic,
      speaker: null as string | null,
    })),
    ...facts.decisions.map((d) => ({
      timestamp: d.ts,
      type: "decision",
      content: d.decision,
      speaker: d.owner,
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const raw = {
    summary_short: synth.summary_short,
    summary_detailed: synth.summary_detailed,
    key_points: synth.key_points,
    strategic_insights: synth.strategic_insights,
    follow_ups: synth.follow_ups,
    meeting_metrics: synth.meeting_metrics,
    action_items: facts.commitments.map((c) => ({
      task: c.what,
      owner: c.who,
      due_date: c.due,
      priority: "medium",
      // Verbatim-grounded: the commitment carries its own quote.
      confidence: "high",
      source_timestamp: c.ts,
    })),
    decisions: facts.decisions.map((d) => ({
      decision: d.decision,
      owner: d.owner,
      // The verbatim quote carries the substance ("Tuesday at the same
      // time") that a terse decision label loses.
      context: d.quote ? `“${d.quote}”` : "",
    })),
    risks: facts.risks.map((r) => r.statement),
    open_questions: facts.open_questions,
    speaker_highlights: facts.notable_quotes.map((q) => ({
      speaker: q.speaker,
      highlight: q.quote,
      context: q.why,
    })),
    timeline_entries: timeline,
  };
  return normalizeInsights(raw, segments);
}

export interface GenerateInsightsOptions {
  /** Canonical spellings passed into the extraction prompt. */
  vocabulary?: string[];
  /**
   * Language the synthesised prose is written in (profiles.summary_language).
   * Extraction always works in the transcript's own language — only the report
   * changes. Defaults to English, which is what every meeting before this
   * option was produced with.
   */
  summaryLanguage?: SummaryLanguage;
  /**
   * Leave the grounding check to the caller (post-transcription.ts runs it
   * in parallel with the coaching pass to shave ~20 s off the callback).
   */
  skipValidation?: boolean;
}

export async function generateInsights(
  openai: OpenAI,
  meeting: Record<string, any>,
  transcript: string,
  speakerSegments: SpeakerSegment[],
  options: GenerateInsightsOptions = {},
): Promise<Record<string, any>> {
  const noUsableTranscript = !transcript || transcript.trim().length < 20;
  if (noUsableTranscript) return emptyInsights();

  const labeled = formatLabeledTranscript(
    speakerSegments,
    transcript || "No transcript available",
  );

  // Two-pass pipeline: extract quoted facts, synthesize prose from facts
  // only, then audit the prose against the facts. Any failure falls back to
  // the battle-tested single-shot path — a meeting must never lose its
  // summary to a new pipeline stage.
  let facts: MeetingFacts | null = null;
  let normalized: Record<string, any> | null = null;
  try {
    facts = await extractFacts(openai, meeting, labeled, options.vocabulary ?? [], speakerSegments);
    const synth = await synthesizeFromFacts(openai, meeting, facts, options.summaryLanguage);
    normalized = assembleInsights(facts, synth, speakerSegments);
    if (!normalized.summary_short) {
      throw new Error("synthesis produced no summary");
    }
  } catch (twoPassError) {
    console.warn(
      "[generateInsights] Two-pass pipeline failed, falling back to single-shot:",
      twoPassError instanceof Error ? twoPassError.message : twoPassError,
    );
    facts = facts && facts.topics.length + facts.commitments.length > 0 ? facts : null;
    normalized = null;
  }

  if (!normalized) {
    normalized = await legacyGenerateInsights(openai, meeting, transcript, speakerSegments, options.summaryLanguage);
  }

  resolveActionItemDates(normalized, meeting.start_time);

  if (facts && !options.skipValidation) {
    try {
      facts.validation = await validateInsights(openai, facts, normalized);
      if (facts.validation.unverified.length > 0) {
        console.warn(
          `[generateInsights] ${facts.validation.unverified.length} claim(s) failed grounding (rate ${facts.validation.grounding_rate})`,
        );
      }
    } catch (validationError) {
      console.warn("[generateInsights] Validation pass failed:", validationError);
    }
  }
  if (facts) normalized.facts = facts;

  return normalized;
}

async function legacyGenerateInsights(
  openai: OpenAI,
  meeting: Record<string, any>,
  transcript: string,
  speakerSegments: SpeakerSegment[],
  summaryLanguage?: SummaryLanguage,
) {
  const attendeesList = (meeting.attendees || [])
    .map((a: any) => a.displayName || a.email)
    .filter(Boolean);
  const attendeesContext =
    attendeesList.length > 0
      ? `\nKnown participants (calendar): ${attendeesList.join(", ")}`
      : "\nKnown participants: none on file. Keep SPEAKER_XX labels; do not invent names.";

  const duration = Number(meeting.duration_seconds);
  const durationLine = Number.isFinite(duration) && duration > 0
    ? `\nDuration: ${Math.round(duration / 60)} minutes (${Math.round(duration)} seconds).`
    : "";

  const labeled = formatLabeledTranscript(
    speakerSegments,
    transcript || "No transcript available",
  );

  const insightsPrompt = `Write a meeting report in the style of Fireflies, Read.ai, and Fathom: scannable recap, notes by topic, owners on commitments, empty lists when nothing was decided.

MEETING: ${meeting.title}${durationLine}${attendeesContext}

TRANSCRIPT (each line is [mm:ss] Speaker: speech — use these times, do not guess):
${labeled}

RULES
- Only facts from the transcript. No market commentary, no invented strategy.
- "We should" / "maybe" / "let's think about" is NOT a decision. A decision is explicit agreement.
- Owner on an action item only if that person committed or was assigned. Otherwise owner is null.
- due_date only if a time was spoken ("Friday", "by Thursday", "next week"). Never invent a calendar date.
- Prefer an empty list over a padded one. Casual / off-topic chat is not an action item.
- Keep SPEAKER_XX labels unless that speaker's real name is used in the speech itself.
- summary_short: 3–5 sentences. Why this meeting, what changed, what happens next. No agenda restatement.
- summary_detailed: notes grouped by topic (the Fireflies "Notes" section), with speaker names. Not a second recap.
- key_points: 4–8 bullets of what was actually discussed.
- strategic_insights: at most 3, and only if the discussion itself supports an implication. Skip if this was operational/casual.
- speaker_highlights: at most one notable quote per speaker, with why it mattered in this meeting.
- timeline_entries: 4–8 chapter headings covering the meeting in order. timestamp MUST be a number of seconds copied from a [mm:ss] line above.
- sentiment_score: overall tone from -1 (tense/negative) to 1 (warm/positive). Neutral meetings are ~0, not 0.5. Do not report talk time or engagement.${summaryLanguageRule(summaryLanguage)}

JSON shape:
{
  "summary_short": "",
  "summary_detailed": "",
  "strategic_insights": [{"insight": "", "category": "market|risk|opportunity|process"}],
  "speaker_highlights": [{"speaker": "", "highlight": "", "context": ""}],
  "key_points": [""],
  "action_items": [
    {
      "task": "verb-first commitment",
      "owner": "Name or null",
      "due_date": "as spoken, or null",
      "priority": "high|medium|low",
      "confidence": "high|medium|low",
      "outcome": "what done looks like",
      "source_timestamp": 0
    }
  ],
  "decisions": [
    {"decision": "", "owner": "Name or null", "context": ""}
  ],
  "risks": [""],
  "open_questions": [""],
  "follow_ups": [
    {"description": "", "assignee": "Name or null", "type": "meeting|research|validation"}
  ],
  "timeline_entries": [
    {"timestamp": 0, "type": "topic|question|decision|action|risk", "content": "", "speaker": "Name or null"}
  ],
  "meeting_metrics": {
    "sentiment_score": 0
  }
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "You are a meeting notetaker. Your notes must be faithful to the transcript, specific, and useful the next morning. Never invent owners, deadlines, decisions, or names. Empty arrays are correct when the meeting did not produce that kind of output. Always respond with valid JSON.",
      },
      { role: "user", content: insightsPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const insightsText = completion.choices[0]?.message?.content || "{}";

  try {
    const insights = JSON.parse(insightsText);
    const normalized = normalizeInsights(insights, speakerSegments);
    if (!normalized.summary_short) {
      normalized.summary_short = "Unable to generate summary";
    }
    return normalized;
  } catch {
    return {
      summary_short: "Unable to generate summary",
      summary_detailed: "",
      strategic_insights: [],
      speaker_highlights: [],
      key_points: [],
      action_items: [],
      decisions: [],
      risks: [],
      open_questions: [],
      follow_ups: [],
      timeline_entries: [],
      meeting_metrics: { sentiment_score: 0 },
    };
  }
}

export async function saveInsights(
  supabase: any,
  meetingId: string,
  insights: Record<string, any>,
) {
  const { data: existingRows } = await supabase
    .from("meeting_insights")
    .select("id")
    .eq("meeting_id", meetingId)
    .limit(1);

  if (!existingRows || existingRows.length === 0) {
    const { error: insertError } = await supabase.from("meeting_insights").insert({
      meeting_id: meetingId,
      summary_short: insights.summary_short || "",
      summary_detailed: insights.summary_detailed || "",
      key_points: insights.key_points || [],
      action_items: insights.action_items || [],
      decisions: insights.decisions || [],
      risks: insights.risks || [],
      follow_ups: insights.follow_ups || [],
      strategic_insights: insights.strategic_insights || [],
      open_questions: insights.open_questions || [],
      speaker_highlights: insights.speaker_highlights || [],
      timeline_entries: insights.timeline_entries || [],
      meeting_metrics: insights.meeting_metrics || {},
      facts: insights.facts || null,
      coaching: insights.coaching || null,
    });
    if (insertError) {
      console.error(`[saveInsights] Failed to insert insights for meeting ${meetingId}:`, insertError);
      throw new Error(`Failed to save insights: ${insertError.message}`);
    }
  }
}

export function isHarnessMeeting(title?: string | null): boolean {
  return typeof title === "string" && title.startsWith("[harness]");
}

export function harnessEmailsEnabled(): boolean {
  return Deno.env.get("HARNESS_EMAILS") === "true";
}

export async function deliverResults(
  supabase: any,
  meeting: Record<string, any>,
  insights: Record<string, any>,
  config: {
    sendEmail?: boolean;
    supabaseUrl: string;
    supabaseServiceKey: string;
  },
) {
  let emailSent = false;
  const reviewersEmailed: string[] = [];

  // Harness-created meetings ([harness] title prefix) run against prod on every
  // harness invocation — ~6 summary emails a run. Suppress delivery for them
  // unless HARNESS_EMAILS=true is explicitly set for a delivery-verification run.
  if (isHarnessMeeting(meeting.title) && !harnessEmailsEnabled()) {
    console.log(`[deliverResults] Skipping email for harness meeting ${meeting.id} (HARNESS_EMAILS not enabled)`);
    return { emailSent: false, skippedHarness: true };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email_summaries_enabled, email")
    .eq("user_id", meeting.user_id)
    .single();

  // Deliver by email when the caller explicitly asked for it, or when the user
  // has email summaries enabled (the default). Nothing in the bot pipeline sets
  // `sendEmail`, so without this profile fallback no bot-recorded meeting would
  // ever be emailed — despite onboarding promising exactly that.
  const emailEnabled =
    config.sendEmail === true || profile?.email_summaries_enabled !== false;

  const emailUrl = `${config.supabaseUrl}/functions/v1/send-meeting-email`;

  const send = async (recipientEmail?: string) => {
    const emailResponse = await fetch(emailUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.supabaseServiceKey}`,
      },
      body: JSON.stringify(
        recipientEmail
          ? { meetingId: meeting.id, recipientEmail }
          : { meetingId: meeting.id },
      ),
    });
    return await emailResponse.json();
  };

  if (emailEnabled) {
    try {
      const emailResult = await send();
      emailSent = emailResult.success === true;
      console.log("Email result:", emailResult);
    } catch (emailError) {
      console.error("Email notification error:", emailError);
    }
  }

  // Reviewers on the allowlist who were also on this meeting's invite get the
  // same summary. Independent of `emailEnabled`: that flag is the owner's own
  // "mail me my summaries" preference, and a reviewer copy is not that. Each
  // send takes its own (meeting, recipient) claim, so replayed callbacks cannot
  // double-mail them either.
  const reviewers = await resolveAllowlistedRecipients(
    supabase,
    meeting,
    profile?.email,
  );

  for (const reviewer of reviewers) {
    try {
      const result = await send(reviewer);
      if (result?.success) reviewersEmailed.push(reviewer);
      console.log(`[deliverResults] Reviewer copy → ${reviewer}:`, result);
    } catch (reviewerError) {
      console.error(`[deliverResults] Reviewer copy to ${reviewer} failed:`, reviewerError);
    }
  }

  return { emailSent, reviewersEmailed };
}
