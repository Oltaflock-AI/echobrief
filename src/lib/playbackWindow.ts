/**
 * Page time ↔ media time for a share link that plays only the guest window.
 *
 * The share page speaks page time (0:00 = the guest joined); the media element
 * speaks recording time. Every seek and every progress report crosses here, and
 * both directions clamp to the window so nothing either side of it is reachable
 * through the page.
 */
export interface PlaybackWindow {
  start: number;
  end: number;
}

export function windowLength(w: PlaybackWindow): number {
  return Math.max(0, w.end - w.start);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(value) ? value : lo));
}

/** A page-time position → where to put the media element. */
export function toMediaTime(display: number, w: PlaybackWindow): number {
  return clamp(display, 0, windowLength(w)) + w.start;
}

/** The media element's position → what the page shows. */
export function toDisplayTime(media: number, w: PlaybackWindow): number {
  return clamp(media - w.start, 0, windowLength(w));
}

/** `m:ss`, or `h:mm:ss` past an hour. */
export function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
