/**
 * Quote anchoring: put a fact back where it was actually said.
 *
 * The extraction pass asks the model for a `ts` alongside every verbatim quote,
 * and on long meetings the model simply invents it. Measured 2026-09-09 against
 * two real calls: on a 90-minute meeting the model stamped content from minute
 * 88 as `ts: 13`, and every number on the call came back with a minute-scale
 * number (13, 41, 46) instead of seconds. `snapTimestamp` then snapped those
 * onto the nearest real segment start — near the beginning of the call — so the
 * Recording tab's topic chips and timestamps all collapsed into the first
 * ~20 minutes of an hour-long meeting.
 *
 * The fix is to stop trusting the model for a number we can derive: the quote
 * is verbatim, so find it in the diarized segments and take THAT segment's
 * start. The model's `ts` survives only as a fallback for items we cannot
 * locate (a paraphrased quote, a topic heading with no quote at all).
 *
 * Also the home of the labeled-transcript formatter, so `facts.ts` can build a
 * per-window transcript without importing `insights.ts` (which imports it).
 */

export interface AnchorSegment {
  speaker?: string;
  text?: string;
  start?: number;
  end?: number;
}

/** `[m:ss]` clock used in the transcript we send to the model. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `[${m}:${String(s).padStart(2, "0")}]`;
}

/**
 * Timestamped, speaker-labeled transcript. Fireflies/Read.ai chapter times
 * are only as good as the times in the source; without them the model guesses.
 */
export function formatLabeledTranscript(
  segments: AnchorSegment[],
  fallback: string,
): string {
  if (!Array.isArray(segments) || segments.length === 0) return fallback;
  return segments
    .map((s) => {
      const start = Number(s.start);
      const clock = Number.isFinite(start) ? `${formatClock(start)} ` : "";
      return `${clock}${s.speaker || "Unknown"}: ${s.text ?? ""}`.trimEnd();
    })
    .join("\n");
}

/** Lowercase, strip punctuation, collapse whitespace — matching form only. */
export function normalizeForMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface IndexedSegment {
  start: number;
  text: string;
  tokens: Set<string>;
}

export interface AnchorIndex {
  segments: IndexedSegment[];
  /**
   * The whole meeting as one normalized string, with a char-offset map back to
   * the segment each stretch came from. A quote the model lifted across two or
   * three diarized rows still matches here, and the offset map means the hit
   * resolves to the row the quote STARTS in — not to the head of the window.
   */
  joined: { text: string; spans: Array<{ start: number; from: number; to: number }> };
}

/**
 * Prepare the segments once per meeting. Anchoring runs over every fact in the
 * facts object (up to ~120 items), so the normalization must not be redone per
 * lookup.
 */
export function buildAnchorIndex(segments: AnchorSegment[]): AnchorIndex {
  const indexed: IndexedSegment[] = [];
  for (const s of Array.isArray(segments) ? segments : []) {
    const start = Number(s?.start);
    if (!Number.isFinite(start)) continue;
    const text = normalizeForMatch(s?.text);
    if (!text) continue;
    indexed.push({ start, text, tokens: new Set(contentTokens(text)) });
  }
  const spans: Array<{ start: number; from: number; to: number }> = [];
  let text = "";
  for (const s of indexed) {
    const from = text.length;
    text += (text ? " " : "") + s.text;
    spans.push({ start: s.start, from: from === 0 ? 0 : from + 1, to: text.length });
  }
  return { segments: indexed, joined: { text, spans } };
}

/** Words that carry no signal for the fuzzy pass. */
const STOP_WORDS = new Set(
  "a an and are as at be but by can did do does for from had has have i if in is it its just like me my not of on or our so than that the their them then there they this to too us was we were what when which who will with you your yeah okay right".split(
    " ",
  ),
);

/**
 * Crude suffix stripping so "bookings"/"booking" and "charged"/"charges" match.
 * A real stemmer is not worth a dependency here: the comparison is between a
 * model's paraphrase and speech, and both sides go through the same function.
 */
function stem(token: string): string {
  if (token.length <= 4) return token;
  return token.replace(/(ings|ing|ies|ied|ed|es|s)$/, "");
}

function contentTokens(text: string): string[] {
  return text
    .split(" ")
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
    .map(stem)
    .filter((t) => t.length > 2);
}

/**
 * Where in the meeting this quote was said, in seconds, or null when it cannot
 * be located confidently. Never guesses: a wrong timestamp is worse than the
 * model's, because it looks authoritative.
 *
 * `bounds` restricts the search to one extraction window — a quote from
 * minute 80 must not anchor onto an identical phrase at minute 3.
 */
export function anchorQuote(
  quote: unknown,
  index: AnchorIndex,
  bounds?: { from: number; to: number },
): number | null {
  const needle = normalizeForMatch(quote);
  // Under ~4 words a quote matches half the meeting; the model's own ts is no
  // worse than an arbitrary one of those.
  if (needle.length < 16 || needle.split(" ").length < 4) return null;

  const inBounds = (start: number) =>
    !bounds || (start >= bounds.from - 30 && start <= bounds.to + 30);

  // The model quotes verbatim but often trims or extends the tail, so match on
  // the head of the quote rather than the whole string.
  const head = needle.split(" ").slice(0, 12).join(" ");

  for (const s of index.segments) {
    if (inBounds(s.start) && s.text.includes(head)) return Math.round(s.start);
  }
  const at = index.joined.text.indexOf(head);
  if (at >= 0) {
    const span = index.joined.spans.find((sp) => at >= sp.from && at < sp.to);
    if (span && inBounds(span.start)) return Math.round(span.start);
    if (span) return null; // Found it, but outside this window — not ours to claim.
  }

  // Fuzzy: the quote's content words against each segment. Requires most of the
  // quote to be present, which a coincidental overlap does not reach.
  const wanted = contentTokens(needle);
  if (wanted.length < 3) return null;
  let bestStart: number | null = null;
  let bestScore = 0;
  for (const s of index.segments) {
    if (!inBounds(s.start)) continue;
    let hit = 0;
    for (const token of wanted) if (s.tokens.has(token)) hit += 1;
    const score = hit / wanted.length;
    if (score > bestScore) {
      bestScore = score;
      bestStart = s.start;
    }
  }
  return bestScore >= 0.7 && bestStart !== null ? Math.round(bestStart) : null;
}

/**
 * A topic is a heading the model wrote, not a line anyone said, so it cannot be
 * matched verbatim. Score each segment by how much of the heading's own
 * vocabulary it carries and take the earliest strong match — which is what a
 * chapter marker means. Weaker evidence than {@link anchorQuote} demands, so the
 * bar is the number of distinct content words matched, not a ratio alone.
 */
export function anchorTopic(
  topic: unknown,
  notes: unknown,
  index: AnchorIndex,
  bounds?: { from: number; to: number },
): number | null {
  const wanted = contentTokens(normalizeForMatch(`${topic ?? ""} ${notes ?? ""}`));
  const unique = [...new Set(wanted)];
  if (unique.length < 3) return null;

  let bestStart: number | null = null;
  let bestHits = 0;
  for (const s of index.segments) {
    if (bounds && (s.start < bounds.from - 30 || s.start > bounds.to + 30)) continue;
    let hits = 0;
    for (const token of unique) if (s.tokens.has(token)) hits += 1;
    if (hits > bestHits) {
      bestHits = hits;
      bestStart = s.start;
    }
  }
  // At least three of the heading's own words in one utterance, and at least
  // half of them — below that it is a coincidence, and the window start is the
  // more honest answer.
  if (bestStart === null || bestHits < 3 || bestHits / unique.length < 0.5) return null;
  return Math.round(bestStart);
}

type FactItem = Record<string, unknown>;

/** Keys of the facts object whose rows carry a verbatim `quote`. */
const QUOTED_KEYS = [
  "numbers",
  "entities",
  "pain_points",
  "objections",
  "buying_signals",
  "explicit_asks",
  "commitments",
  "decisions",
  "notable_quotes",
] as const;

/**
 * Rewrite every fact's `ts` from its quote. Rows whose quote cannot be located
 * keep the model's number, clamped into `bounds` when they came from a window.
 *
 * `topics` and `risks` carry no quote — a topic is a chapter heading, not
 * something anyone said — so they are anchored on their own words against the
 * transcript, and fall back to the window they were extracted from.
 */
export function anchorFacts<T extends object>(
  facts: T,
  segments: AnchorSegment[],
  bounds?: { from: number; to: number },
): T {
  const index = buildAnchorIndex(segments);
  if (index.segments.length === 0) return facts;

  const clamp = (value: unknown): number => {
    const n = Number(value);
    const safe = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    if (!bounds) return safe;
    if (safe < bounds.from || safe > bounds.to) return Math.round(bounds.from);
    return safe;
  };

  const out = { ...facts } as Record<string, unknown>;

  for (const key of QUOTED_KEYS) {
    const rows = Array.isArray(out[key]) ? (out[key] as FactItem[]) : null;
    if (!rows) continue;
    out[key] = rows.map((row) => {
      const anchored = anchorQuote(row.quote, index, bounds);
      const next: FactItem = { ...row, ts: anchored ?? clamp(row.ts) };
      if (key === "objections" && next.how_addressed_ts != null) {
        next.how_addressed_ts = clamp(next.how_addressed_ts);
      }
      return next;
    });
  }

  // Topics: anchor on the heading plus its notes, which are drawn from the
  // window's own words, and demand a strong overlap before trusting it.
  const topics = Array.isArray(out.topics) ? (out.topics as FactItem[]) : null;
  if (topics) {
    out.topics = topics.map((t) => {
      const anchored = anchorTopic(t.topic, t.notes, index, bounds);
      return { ...t, ts: anchored ?? clamp(t.ts) };
    });
  }

  const risks = Array.isArray(out.risks) ? (out.risks as FactItem[]) : null;
  if (risks) {
    out.risks = risks.map((r) => {
      const anchored = anchorQuote(r.statement, index, bounds);
      return { ...r, ts: anchored ?? clamp(r.ts) };
    });
  }

  return out as T;
}
