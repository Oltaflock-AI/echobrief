/**
 * The Recording tab of the V2 meeting page (mockup 03-meeting-detail-recording).
 *
 * Two columns: the player, a who-spoke-when bar and topic chips on the left; a
 * transcript that follows playback on the right. Clicking anything with a time
 * on it seeks the video, and the transcript row under the playhead is
 * highlighted and scrolled into view.
 *
 * Everything here is drawn from data we actually hold: the speaker segments
 * (speaker + start/end) and `facts.topics` (topic + ts). The mockup's "Clip
 * this moment" card is deliberately absent — there is no clip backend.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { RecordingPlayer } from '@/components/meeting/RecordingPlayer';

export interface PanelSegment {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
  zone?: string;
}

export interface PanelTopic {
  topic: string;
  ts?: number;
  notes?: string;
}

/** The four speaker colours from the brand tokens, in order of first speech. */
const SPEAKER_VARS = ['--eb-speaker-1', '--eb-speaker-2', '--eb-speaker-3', '--eb-speaker-4'];

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function RecordingPanel({
  meetingId,
  segments,
  topics,
  seekSeconds,
  onSeek,
}: {
  meetingId: string;
  /** Meeting-zone segments, in order. */
  segments: PanelSegment[];
  topics: PanelTopic[];
  /** Deep-link / cross-tab seek target owned by the page. */
  seekSeconds?: number | null;
  /** Lets the page keep one seek target across tabs. */
  onSeek?: (ts: number) => void;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [seek, setSeek] = useState<{ t: number; n: number }>({ t: seekSeconds ?? 0, n: 0 });
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // A seek asked for elsewhere on the page (a fact timestamp, ?t=) lands here.
  useEffect(() => {
    if (seekSeconds == null) return;
    setSeek((prev) => (prev.t === seekSeconds ? prev : { t: seekSeconds, n: prev.n + 1 }));
  }, [seekSeconds]);

  const jump = (ts: number) => {
    setSeek((prev) => ({ t: Math.max(0, Math.floor(ts)), n: prev.n + 1 }));
    onSeek?.(Math.max(0, Math.floor(ts)));
  };

  const timed = useMemo(() => segments.filter((s) => typeof s.start === 'number'), [segments]);

  const duration = useMemo(() => {
    let max = 0;
    for (const s of timed) max = Math.max(max, s.end ?? s.start ?? 0);
    return max;
  }, [timed]);

  // Colour per speaker, assigned in order of first appearance so the bar, the
  // legend and the transcript agree.
  const speakerColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of segments) {
      if (!s.speaker || map.has(s.speaker)) continue;
      map.set(s.speaker, `var(${SPEAKER_VARS[map.size % SPEAKER_VARS.length]})`);
    }
    return map;
  }, [segments]);

  // The row under the playhead: the last segment that started at or before it.
  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < timed.length; i += 1) {
      if ((timed[i].start ?? 0) <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [timed, currentTime]);

  useEffect(() => {
    const el = activeRef.current;
    const list = listRef.current;
    if (!el || !list) return;
    const top = el.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - el.clientHeight) {
      list.scrollTo({ top: top - 80, behavior: 'smooth' });
    }
  }, [activeIndex]);

  const legend = [...speakerColor.entries()].slice(0, 4);
  const axis = duration > 0 ? [0, 0.25, 0.5, 0.75, 1].map((f) => f * duration) : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <RecordingPlayer
          meetingId={meetingId}
          seekSeconds={seek.n === 0 && seekSeconds == null ? null : seek.t}
          seekNonce={seek.n}
          onTime={setCurrentTime}
          className="w-full rounded-card border border-eb-border bg-eb-sidebar"
        />

        {duration > 0 && (
          <div className="rounded-card border border-eb-border bg-eb-card p-[18px] shadow-eb-card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-outfit text-[15px] font-semibold tracking-[-0.01em] text-eb-text">
                Who spoke when
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                {legend.map(([name, color]) => (
                  <span key={name} className="flex items-center gap-1.5 font-dmsans text-[12px] text-eb-secondary">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
                    {name}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative h-3 w-full overflow-hidden rounded-[3px] bg-eb-chip">
              {timed.map((s, i) => {
                const start = s.start ?? 0;
                const end = s.end ?? start + 2;
                const left = (start / duration) * 100;
                const width = Math.max(0.4, ((end - start) / duration) * 100);
                return (
                  <button
                    key={i}
                    type="button"
                    title={`${s.speaker} · ${clock(start)}`}
                    onClick={() => jump(start)}
                    className="absolute top-0 h-full cursor-pointer"
                    style={{ left: `${left}%`, width: `${width}%`, background: speakerColor.get(s.speaker) }}
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
                <span key={i}>{clock(t)}</span>
              ))}
            </div>

            {topics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {topics.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => jump(t.ts ?? 0)}
                    title={t.notes}
                    className="inline-flex items-center gap-2 rounded-pill border border-eb-border bg-eb-card px-3 py-1.5 font-dmsans text-[12.5px] text-eb-text hover:bg-eb-row-hover"
                  >
                    <span className="font-mono text-[11px] text-eb-accent">{clock(t.ts ?? 0)}</span>
                    {t.topic}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex max-h-[720px] flex-col rounded-card border border-eb-border bg-eb-card shadow-eb-card">
        <div className="flex items-center justify-between border-b border-eb-divider px-[18px] py-3.5">
          <h3 className="font-outfit text-[15px] font-semibold tracking-[-0.01em] text-eb-text">Transcript</h3>
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-eb-green-bg px-2.5 py-1 font-dmsans text-[11.5px] font-medium text-eb-green">
            <span className="h-1.5 w-1.5 rounded-full bg-eb-green" />
            Follows video
          </span>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-[18px] py-2">
          {timed.length === 0 ? (
            <p className="py-8 text-center font-dmsans text-[13px] text-eb-secondary">
              No timed transcript for this meeting.
            </p>
          ) : (
            timed.map((s, i) => {
              const active = i === activeIndex;
              return (
                <button
                  key={i}
                  ref={active ? activeRef : undefined}
                  type="button"
                  onClick={() => jump(s.start ?? 0)}
                  className={cn(
                    'flex w-full gap-3 rounded-input px-2 py-2 text-left transition-colors',
                    active ? 'bg-eb-accent-soft' : 'hover:bg-eb-row-hover',
                  )}
                >
                  <span className="mt-[2px] shrink-0 font-mono text-[11px] text-eb-secondary">
                    {clock(s.start ?? 0)}
                  </span>
                  <span className="font-dmsans text-[13px] leading-relaxed text-eb-prose">
                    <span className="font-medium" style={{ color: speakerColor.get(s.speaker) }}>
                      {s.speaker}{' '}
                    </span>
                    {s.text}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
