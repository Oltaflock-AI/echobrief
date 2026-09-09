/**
 * How long the meeting actually was.
 *
 * Three sources, in order of trust:
 *   1. the audio's own duration, measured by the splitter — authoritative;
 *   2. the last transcript segment's end — slightly short, but real speech;
 *   3. wall clock, end_time minus start_time.
 *
 * The third is a guess and was silently wrong in the worst way. `end_time` is
 * written when the pipeline FINISHES, not when the call did, so a meeting
 * recovered days later — by the monitor, by a replayed webhook, by hand — got
 * the whole gap. Two "Daily Sync Meeting" rows carried 197.6 h and 269.7 h
 * (found 2026-09-09): eight and eleven days, for a half-hour standup.
 *
 * So wall clock is used only when it is plausible. Past that ceiling the answer
 * is `null` — the duration is unknown, and the UI renders nothing rather than a
 * number nobody should believe. Clamping to the ceiling instead would just be a
 * more believable fabrication.
 */

/**
 * The longest a real meeting can be. Recall stops recording at the plan's
 * per-meeting ceiling via `automatic_leave.in_call_recording_timeout`, and the
 * most generous plan (teams) allows 6 h — see `_shared/entitlements.ts`. A
 * little headroom is left for the bot joining before the hosts do.
 */
export const MAX_PLAUSIBLE_DURATION_SECONDS = 7 * 60 * 60;

export interface DurationInputs {
  /** From the splitter, via processing_config.audio_duration_seconds. */
  audioDurationSeconds?: number | null;
  /** Largest `end` across the transcript's speaker segments. */
  lastSegmentEnd?: number | null;
  /** The meeting's start_time. */
  startTime?: Date | string | null;
  /** When the pipeline finished — NOT when the call ended. */
  endTime?: Date | string | null;
}

function positive(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toMs(value: Date | string | null | undefined): number {
  if (!value) return NaN;
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Seconds, or null when no source is trustworthy. Never returns 0 — a meeting
 * of zero length is not a measurement, it is a missing one.
 */
export function resolveDurationSeconds(inputs: DurationInputs): number | null {
  const audio = positive(inputs.audioDurationSeconds);
  if (audio) return Math.round(audio);

  const segment = positive(inputs.lastSegmentEnd);
  if (segment) return Math.round(segment);

  const start = toMs(inputs.startTime);
  const end = toMs(inputs.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const wallClock = (end - start) / 1000;
  if (wallClock <= 0) return null;
  if (wallClock > MAX_PLAUSIBLE_DURATION_SECONDS) return null;

  return Math.round(wallClock);
}
