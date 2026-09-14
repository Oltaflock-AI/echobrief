/**
 * What a shared meeting's transcript looks like to somebody outside the account.
 *
 * Kept out of the handler so the rule can be tested directly: this is the only
 * thing standing between a public URL and the pre/post-call chatter that
 * `zones.ts` spends real effort identifying.
 */

export interface PublicSegment {
  speaker: string;
  text: string;
  start: number | null;
}

interface RawSegment {
  speaker?: unknown;
  text?: unknown;
  start?: unknown;
  zone?: unknown;
}

/**
 * Meeting-zone segments only, carrying nothing but who said what and when.
 *
 * Fields are whitelisted rather than filtered: `original_text` (the
 * pre-translation Devanagari a leaked segment keeps) and anything added to a
 * segment in future are dropped by construction, so widening the public payload
 * has to be a deliberate edit here.
 */
export function publicSegments(raw: unknown): PublicSegment[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawSegment[])
    .filter((seg) => {
      if (!seg || typeof seg !== "object") return false;
      const zone = typeof seg.zone === "string" ? seg.zone : "meeting";
      return zone === "meeting" && typeof seg.text === "string" && seg.text.trim().length > 0;
    })
    .map((seg) => ({
      speaker: typeof seg.speaker === "string" && seg.speaker.trim() ? seg.speaker : "Speaker",
      text: String(seg.text).trim(),
      start: typeof seg.start === "number" && Number.isFinite(seg.start) ? seg.start : null,
    }));
}

// ---- facts -----------------------------------------------------------------

/**
 * The part of the facts object a public page may render.
 *
 * Facts are extracted from the meeting zone only, so the zone guarantee is
 * already met; what this whitelist protects is the *verbatim quotes* every fact
 * carries (the raw words, which the summary paraphrases on purpose), speaker
 * attribution on numbers, and the sales-read lists — objections, buying
 * signals, notable quotes, entities — that were written for the owner, not for
 * the person across the table who may be the one holding the link.
 */
export interface PublicFacts {
  topics: Array<{ topic: string; ts: number; notes: string }>;
  numbers: Array<{ metric: string; value: string; ts: number }>;
  pain_points: Array<{ statement: string; ts: number }>;
  explicit_asks: Array<{ statement: string; ts: number }>;
  decisions: Array<{ decision: string; owner: string | null; ts: number }>;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Seconds, or null when the row cannot be placed in the meeting. */
function seconds(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function rows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((r) => r && typeof r === "object") as Record<string, unknown>[] : [];
}

/**
 * Null when there are no topics: the page groups everything else under them,
 * so without topics there is nothing to render and the caller falls back to
 * the prose summary (every meeting before 2026-08-31).
 */
export function publicFacts(raw: unknown): PublicFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;

  const topics = rows(f.topics).flatMap((t) => {
    const topic = text(t.topic);
    const ts = seconds(t.ts);
    return topic && ts !== null ? [{ topic, ts, notes: text(t.notes) }] : [];
  });
  if (topics.length === 0) return null;

  return {
    topics,
    numbers: rows(f.numbers).flatMap((n) => {
      const metric = text(n.metric);
      const value = text(n.value);
      const ts = seconds(n.ts);
      return metric && value && ts !== null ? [{ metric, value, ts }] : [];
    }),
    pain_points: rows(f.pain_points).flatMap((p) => {
      const statement = text(p.statement);
      const ts = seconds(p.ts);
      return statement && ts !== null ? [{ statement, ts }] : [];
    }),
    explicit_asks: rows(f.explicit_asks).flatMap((a) => {
      const statement = text(a.statement);
      const ts = seconds(a.ts);
      return statement && ts !== null ? [{ statement, ts }] : [];
    }),
    decisions: rows(f.decisions).flatMap((d) => {
      const decision = text(d.decision);
      const ts = seconds(d.ts);
      return decision && ts !== null ? [{ decision, owner: text(d.owner) || null, ts }] : [];
    }),
  };
}
