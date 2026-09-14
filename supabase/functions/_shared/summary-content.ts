/**
 * The text rules behind every "summary to the team room" post — Slack and
 * ClickUp build from these so wording cannot drift between destinations.
 *
 * Everything here is pure and takes the insights object the pipeline saves.
 * WHAT MAY LEAVE is decided here too: summary, one highlight from `key_points`,
 * decisions, action items and next steps — all computed from the MEETING ZONE
 * ONLY (`_shared/zones.ts`). Never the transcript, coaching, `facts` (verbatim
 * quotes) or attendee emails; a channel is a room full of people.
 */

export function truncate(text: string, max: number): string {
  const clean = (text ?? "").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}


/** "57 min", "1 h 32 min", or "" when the duration is unknown. */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 60) return "";
  const mins = Math.round(s / 60);
  if (mins < 90) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

export interface ActionItem { text: string; owner: string; due: string; urgent: boolean }

/**
 * Action items have been plain strings in some meetings and
 * `{task, owner, due_date, priority}` objects in others since the two-pass
 * rewrite. A renderer that assumes one of them posts "[object Object]" into a
 * team channel, so both shapes are handled here and nowhere else.
 */
export function asActionItems(items: unknown, max: number): ActionItem[] {
  if (!Array.isArray(items)) return [];
  const out: ActionItem[] = [];
  for (const item of items) {
    // Checked at the TOP: the string branch below `continue`s, so a cap tested
    // only at the bottom silently never applies to string-shaped items.
    if (out.length >= max) break;
    if (typeof item === "string") {
      if (item.trim()) out.push({ text: item.trim(), owner: "", due: "", urgent: false });
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const text = String(o.task ?? o.text ?? o.title ?? o.description ?? "").trim();
      if (!text) continue;
      out.push({
        text,
        owner: String(o.owner ?? o.assignee ?? "").trim(),
        due: String(o.due_date ?? o.due ?? "").trim(),
        urgent: String(o.priority ?? "").toLowerCase() === "high",
      });
    }
  }
  return out;
}

/**
 * Decisions arrive as `Decision (Owner) — "the verbatim sentence that settled
 * it"`. The quote is the evidence, and it belongs in the report; in a channel
 * it doubles the length of every line and puts someone's exact words in front
 * of a room. Trimmed only when a real decision is left behind — a line that is
 * mostly quote keeps it rather than being gutted to nothing.
 */
export function stripQuoteTail(line: string): string {
  const trimmed = line.replace(/\s*[—–-]+\s*["\u201C\u2018'][\s\S]*$/, "").trim();
  return trimmed.length >= 25 ? trimmed : line;
}

/** Decisions and other list fields that are strings or single-key objects. */
export function asLines(items: unknown, max: number): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        return String(o.decision ?? o.statement ?? o.text ?? o.title ?? o.task ?? "").trim();
      }
      return "";
    })
    .filter(Boolean)
    .map(stripQuoteTail)
    .slice(0, max);
}

/** Normalised for comparison only: punctuation and case carry no meaning here. */
export function sameText(a: string, b: string): boolean {
  const n = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  return n(a) === n(b) && n(a).length > 0;
}

/**
 * Next steps, from `follow_ups`, minus anything already listed as an action
 * item.
 *
 * The pipeline emits both, and measured across the last eight meetings they
 * overlap about half the time — "Look into Travify's features" arrived as an
 * action item and again, word for word, as a follow-up. Printing both would
 * make the post look padded and, worse, make a reader wonder whether they are
 * two different tasks. When everything overlaps the section is empty and is
 * omitted entirely, which is the correct outcome: there was nothing to add.
 */
export function asNextSteps(
  followUps: unknown,
  actions: ActionItem[],
  max: number,
): Array<{ text: string; who: string }> {
  if (!Array.isArray(followUps)) return [];
  const out: Array<{ text: string; who: string }> = [];
  for (const item of followUps) {
    if (out.length >= max) break;
    const text = typeof item === "string"
      ? item.trim()
      : String((item as Record<string, unknown>)?.description ?? "").trim();
    if (!text) continue;
    if (actions.some((a) => sameText(a.text, text))) continue;
    if (out.some((o) => sameText(o.text, text))) continue;
    const who = typeof item === "string"
      ? ""
      : String((item as Record<string, unknown>)?.assignee ?? "").trim();
    out.push({ text, who });
  }
  return out;
}

/**
 * The one line worth remembering, drawn from `key_points`.
 *
 * A number is what people quote back at each other afterwards — a price, a
 * headcount, a deadline — so a key point containing one wins over one that does
 * not. Deterministic on purpose: this runs unattended on every meeting and a
 * second LLM call to choose a sentence would be cost and latency for a decision
 * a regex settles.
 *
 * It comes from `key_points` rather than `facts` so nothing verbatim leaves for
 * Slack. `facts` quotes are someone's exact words; a channel is a room full of
 * people, and the summary fields are already written for an audience.
 */
export function pickHighlight(insights: Record<string, any>): string {
  const points = (Array.isArray(insights?.key_points) ? insights.key_points : [])
    .map((p: unknown) => String(p ?? "").trim())
    .filter(Boolean);
  if (!points.length) return "";
  const withNumber = points.find((p: string) => /\d/.test(p));
  return withNumber ?? points[0];
}

/** How many distinct speakers the metrics saw, or 0 when unknown. */
export function speakerCount(insights: Record<string, any>): number {
  const share = insights?.meeting_metrics?.speaker_participation;
  return share && typeof share === "object" ? Object.keys(share).length : 0;
}

