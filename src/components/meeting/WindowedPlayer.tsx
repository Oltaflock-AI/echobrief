import { useEffect, useRef, useState } from 'react';
import { Maximize, Pause, Play } from 'lucide-react';
import {
  clockLabel,
  toDisplayTime,
  toMediaTime,
  windowLength,
  type PlaybackWindow,
} from '@/lib/playbackWindow';

/**
 * The share-link player: plays only the guest's join → leave.
 *
 * The browser's native controls would show the whole recording's length and
 * let the scrubber reach the chatter either side, so they are replaced by a bar
 * that only knows the window. Page time (0:00 = the guest joined) is what the
 * reader sees; `playbackWindow.ts` maps it onto the media element, clamped.
 *
 * This is a viewing boundary, not a file boundary: the URL behind the element
 * is still the full recording. The share dialog says so.
 */
const SPEEDS = [1, 1.25, 1.5, 2];

export function WindowedPlayer({
  kind,
  url,
  window: w,
  seekSeconds,
  seekNonce,
  onTime,
  className,
}: {
  kind: 'video' | 'audio';
  url: string;
  window: PlaybackWindow;
  /** Page time. */
  seekSeconds?: number | null;
  seekNonce?: number;
  /** Reports page time. */
  onTime?: (seconds: number) => void;
  className?: string;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const length = windowLength(w);

  // Land on the guest's join as soon as the media can seek.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const land = () => {
      if (el.currentTime < w.start || el.currentTime > w.end) el.currentTime = w.start;
    };
    if (el.readyState >= 1) land();
    else el.addEventListener('loadedmetadata', land, { once: true });
    return () => el.removeEventListener('loadedmetadata', land);
  }, [url, w.start, w.end]);

  // Timestamp clicks and ?t= deep links arrive in page time.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || seekSeconds == null) return;
    const apply = () => {
      try {
        el.currentTime = toMediaTime(seekSeconds, w);
        void el.play()?.catch(() => {});
      } catch {
        // Not seekable yet — a timestamp is a convenience, never an error.
      }
    };
    if (el.readyState >= 1) apply();
    else el.addEventListener('loadedmetadata', apply, { once: true });
    return () => el.removeEventListener('loadedmetadata', apply);
    // w is covered by its edges; a new object with the same edges is no seek.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekSeconds, seekNonce, url, w.start, w.end]);

  // `timeupdate` fires only ~4× a second — enough to overrun the guest's leave
  // by a sentence. While playing, check every frame instead.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const el = mediaRef.current;
      if (el && el.currentTime >= w.end) {
        el.pause();
        el.currentTime = w.end;
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, w.end]);

  const report = () => {
    const el = mediaRef.current;
    if (!el) return;
    const display = toDisplayTime(el.currentTime, w);
    setPosition(display);
    onTime?.(display);
  };

  // Anything that moves the element outside the window — a context-menu
  // control, a keyboard shortcut, a stale seek — is pulled back to the edge.
  const clampToWindow = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.currentTime < w.start - 0.25) el.currentTime = w.start;
    else if (el.currentTime > w.end) {
      el.pause();
      el.currentTime = w.end;
    }
  };

  const toggle = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    if (el.currentTime >= w.end - 0.5) el.currentTime = w.start;
    void el.play()?.catch(() => {});
  };

  const seekTo = (display: number) => {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = toMediaTime(display, w);
    report();
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (mediaRef.current) mediaRef.current.playbackRate = next;
  };

  const fullscreen = () => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void frame.requestFullscreen?.().catch(() => {});
  };

  const mediaEvents = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: () => {
      clampToWindow();
      report();
    },
    onSeeked: () => {
      clampToWindow();
      report();
    },
  };

  return (
    <div
      ref={frameRef}
      className={
        (className ?? 'w-full overflow-hidden rounded-card border border-eb-border bg-eb-sidebar') +
        ' flex flex-col [&:fullscreen]:justify-center'
      }
    >
      {kind === 'video' ? (
        <video
          key={url}
          ref={(el) => { mediaRef.current = el; }}
          src={url}
          preload="metadata"
          playsInline
          onClick={toggle}
          className="w-full cursor-pointer"
          {...mediaEvents}
        />
      ) : (
        <audio key={url} ref={(el) => { mediaRef.current = el; }} src={url} preload="metadata" {...mediaEvents} />
      )}

      <div className="flex items-center gap-3 bg-eb-sidebar px-3 py-2 text-eb-on-dark">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill hover:bg-eb-sidebar-raised"
        >
          {playing ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} />}
        </button>
        <input
          type="range"
          min={0}
          max={length || 0}
          step={0.1}
          value={Math.min(position, length)}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-label="Seek"
          className="h-1 min-w-0 flex-1 cursor-pointer accent-eb-accent"
        />
        <span className="shrink-0 font-mono text-[12px] tabular-nums">
          {clockLabel(position)} / {clockLabel(length)}
        </span>
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label="Playback speed"
          className="shrink-0 rounded-pill px-2 py-1 font-mono text-[12px] hover:bg-eb-sidebar-raised"
        >
          {speed}×
        </button>
        {kind === 'video' && (
          <button
            type="button"
            onClick={fullscreen}
            aria-label="Fullscreen"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill hover:bg-eb-sidebar-raised"
          >
            <Maximize size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
