/**
 * The shape `get-shared-meeting` returns, and the small readers the share
 * surface needs to survive it.
 *
 * Every field here is optional-by-history: insight objects have changed shape
 * three times (decisions were strings, then objects, then strings again), and a
 * link minted in 2026-08 is still expected to render in 2027. So nothing on
 * this page reads a nested field directly — it goes through the readers below,
 * which take `unknown` and always return a string.
 */

export interface ActionItem {
  task?: string;
  title?: string;
  owner?: string;
  assignee?: string;
  due_date?: string;
  due?: string;
  due_date_resolved?: string;
  priority?: string;
  source_timestamp?: number;
}

/** Decisions have been shipped as bare strings AND as objects. Both must render. */
export type Decision = string | { decision?: string; text?: string; context?: string };

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number | null;
}

export interface SharedPayload {
  meeting: {
    title: string;
    start_time: string | null;
    duration_seconds: number | null;
    languages: Record<string, number> | null;
  };
  insights: {
    summary_short: string | null;
    summary_detailed: string | null;
    key_points: string[];
    action_items: ActionItem[];
    decisions: Decision[];
  };
  /** Null when this link does not carry the transcript. */
  transcript: TranscriptSegment[] | null;
  has_recording: boolean;
}

export function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A decision, whichever of the three shapes it arrived in. */
export function decisionText(decision: Decision): string {
  if (typeof decision === 'string') return decision.trim();
  return asText(decision?.decision) || asText(decision?.text);
}

export function decisionContext(decision: Decision): string {
  return typeof decision === 'string' ? '' : asText(decision?.context);
}

export function actionTask(item: ActionItem): string {
  return asText(item?.task) || asText(item?.title);
}

export function actionOwner(item: ActionItem): string {
  return asText(item?.owner) || asText(item?.assignee);
}

export function actionDue(item: ActionItem): string {
  return asText(item?.due_date) || asText(item?.due);
}

/** m:ss, the transcript/timeline format used everywhere in the product. */
export function timestamp(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  gu: 'Gujarati',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  bn: 'Bengali',
  pa: 'Punjabi',
  od: 'Odia',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

/**
 * The languages actually spoken, biggest share first, dropping anything under
 * 5% — Sarvam tags the odd stray segment and "English · Punjabi 1%" reads as a
 * mistake to the person who was in the room.
 */
export function languageMix(languages: Record<string, number> | null | undefined): string[] {
  if (!languages) return [];
  return Object.entries(languages)
    .filter(([, share]) => typeof share === 'number' && share >= 0.05)
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => languageName(code));
}

/** Speakers in the order they first talk, which is the order a reader meets them. */
export function speakersOf(transcript: TranscriptSegment[] | null): string[] {
  if (!transcript) return [];
  const seen: string[] = [];
  for (const segment of transcript) {
    const name = asText(segment?.speaker);
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen;
}
