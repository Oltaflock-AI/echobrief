import { useMemo } from 'react';
import { RecordingPlayer } from '@/components/meeting/RecordingPlayer';
import { timestamp, useJump } from './jump';

/**
 * The player with a who-spoke-when bar under it, for the owner's meeting page.
 *
 * Seeks come from `useJump()` — every timestamp on the page goes through it —
 * and playback time goes back out through `onTime` so the transcript column can
 * follow along. The speaker colours are assigned in order of first speech so
 * the bar, its legend and the transcript agree.
 */
export interface PlayerSegment {
  speaker: string;
  start?: number;
  end?: number;
}

/** The four speaker colours from the brand tokens, in order of first speech. */
const SPEAKER_VARS = ['--eb-speaker-1', '--eb-speaker-2', '--eb-speaker-3', '--eb-speaker-4'];

export function speakerColours(segments: Array<{ speaker: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of segments) {
    if (!s.speaker || map.has(s.speaker)) continue;
    map.set(s.speaker, `var(${SPEAKER_VARS[map.size % SPEAKER_VARS.length]})`);
  }
  return map;
}

export function PlayerPanel({
  meetingId,
  segments,
  currentTime,
  onTime,
}: {
  meetingId: string;
  /** Meeting-zone segments, in order. */
  segments: PlayerSegment[];
  currentTime: number;
  onTime: (seconds: number) => void;
}) {
  const { seekSeconds, seekNonce, jump } = useJump();
  const timed = useMemo(() => segments.filter((s) => typeof s.start === 'number'), [segments]);
  const duration = useMemo(() => {
    let max = 0;
    for (const s of timed) max = Math.max(max, s.end ?? s.start ?? 0);
    return max;
  }, [timed]);
  const colours = useMemo(() => speakerColours(segments), [segments]);
  const legend = [...colours.entries()].slice(0, 4);
  const axis = duration > 0 ? [0, 0.25, 0.5, 0.75, 1].map((f) => f * duration) : [];

  return (
    <div id="share-player" className="flex scroll-mt-28 flex-col gap-3">
      <RecordingPlayer
        meetingId={meetingId}
        seekSeconds={seekSeconds}
        seekNonce={seekNonce}
        onTime={onTime}
        className="w-full rounded-card border border-eb-border bg-eb-sidebar"
      />
      {duration > 0 && (
        <div className="rounded-card border border-eb-border bg-eb-card px-[18px] py-3.5 shadow-eb-card">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-outfit text-[13.5px] font-semibold tracking-[-0.01em] text-eb-text">
              Who spoke when
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              {legend.map(([name, colour]) => (
                <span key={name} className="flex items-center gap-1.5 font-dmsans text-[12px] text-eb-secondary">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: colour }} />
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-[3px] bg-eb-chip">
            {timed.map((s, i) => {
              const start = s.start ?? 0;
              const end = s.end ?? start + 2;
              return (
                <button
                  key={i}
                  type="button"
                  title={`${s.speaker} · ${timestamp(start)}`}
                  onClick={() => jump(start)}
                  className="absolute top-0 h-full cursor-pointer"
                  style={{
                    left: `${(start / duration) * 100}%`,
                    width: `${Math.max(0.4, ((end - start) / duration) * 100)}%`,
                    background: colours.get(s.speaker),
                  }}
                />
              );
            })}
            <span
              className="pointer-events-none absolute top-0 h-full w-[2px] bg-eb-text"
              style={{ left: `${Math.min(100, (currentTime / duration) * 100)}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-eb-secondary">
            {axis.map((t, i) => (
              <span key={i}>{timestamp(t)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
