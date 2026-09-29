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

// ---- the guest window -------------------------------------------------------

/**
 * The part of the recording a share link plays: from the guest's join to their
 * leave (`meetings.boundaries`). Null when nothing was trimmed — an internal
 * call, or no window could be found — and the page then shows everything.
 */
export function shareWindow(boundaries: unknown): { start: number; end: number } | null {
  if (!boundaries || typeof boundaries !== "object") return null;
  const b = boundaries as Record<string, unknown>;
  if (b.internal_only === true) return null;
  const start = seconds(b.first_external_join_ts);
  const end = seconds(b.last_external_leave_ts);
  if (b.first_external_join_ts == null || b.last_external_leave_ts == null) return null;
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

/*
 * Everything a share page receives is in PAGE time: 0:00 is the moment the
 * guest joined, so the person holding the link neither starts at 9:19 nor sees
 * a hint of what came before. The player adds the offset back when it seeks.
 */

function shift(value: number, offset: number): number {
  return Math.max(0, Math.round((value - offset) * 100) / 100);
}

export function shiftSegments(segments: PublicSegment[], offset: number): PublicSegment[] {
  if (!offset) return segments;
  return segments.map((s) => ({ ...s, start: s.start === null ? null : shift(s.start, offset) }));
}

export function shiftPublicFacts(facts: PublicFacts | null, offset: number): PublicFacts | null {
  if (!facts || !offset) return facts;
  return {
    topics: facts.topics.map((t) => ({ ...t, ts: shift(t.ts, offset) })),
    numbers: facts.numbers.map((n) => ({ ...n, ts: shift(n.ts, offset) })),
    pain_points: facts.pain_points.map((p) => ({ ...p, ts: shift(p.ts, offset) })),
    explicit_asks: facts.explicit_asks.map((a) => ({ ...a, ts: shift(a.ts, offset) })),
    decisions: facts.decisions.map((d) => ({ ...d, ts: shift(d.ts, offset) })),
  };
}

/** Numeric `field` shifted on each object row; strings and other shapes pass through. */
function shiftRows(rows: unknown, field: string, offset: number): unknown {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    if (!r || typeof r !== "object" || typeof (r as Record<string, unknown>)[field] !== "number") return r;
    return { ...(r as Record<string, unknown>), [field]: shift((r as Record<string, number>)[field], offset) };
  });
}

/** Action-item and chapter timestamps in the insights block. */
export function shiftSharedInsights<T extends Record<string, unknown>>(insights: T, offset: number): T {
  if (!offset) return insights;
  return {
    ...insights,
    action_items: shiftRows(insights.action_items, "source_timestamp", offset),
    timeline_entries: shiftRows(insights.timeline_entries, "timestamp", offset),
  };
}
