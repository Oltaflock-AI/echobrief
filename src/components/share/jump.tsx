import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { timestamp } from './types';

/**
 * One place that knows what a timestamp click means on the share page.
 *
 * The order is fixed by what the link carries: a recording → open the
 * Recording tab and seek; no recording but a transcript → open the Transcript
 * tab and scroll to that turn; neither → the chip is inert text. Panels render
 * `<Ts>` and never decide any of this themselves, so a link that stops
 * carrying the recording changes one flag here and every timestamp on the page
 * degrades together.
 */
export type ShareTab = 'summary' | 'actions' | 'recording' | 'transcript';

interface JumpState {
  tab: ShareTab;
  setTab: (tab: ShareTab) => void;
  /** Where the recording player should be, and a nonce so repeats still fire. */
  seekSeconds: number | null;
  seekNonce: number;
  /** Where the transcript should scroll, and a nonce so repeats still fire. */
  scrollTo: number | null;
  scrollNonce: number;
  /** False when neither the recording nor the transcript is on this link. */
  canJump: boolean;
  jump: (seconds: number) => void;
}

const JumpContext = createContext<JumpState | null>(null);

export function JumpProvider({
  hasRecording,
  hasTranscript,
  children,
}: {
  hasRecording: boolean;
  hasTranscript: boolean;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<ShareTab>('summary');
  const [seekSeconds, setSeekSeconds] = useState<number | null>(null);
  const [seekNonce, setSeekNonce] = useState(0);
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  const [scrollNonce, setScrollNonce] = useState(0);

  const jump = useCallback(
    (seconds: number) => {
      if (hasRecording) {
        setTab('recording');
        setSeekSeconds(seconds);
        setSeekNonce((n) => n + 1);
      } else if (hasTranscript) {
        setTab('transcript');
        setScrollTo(seconds);
        setScrollNonce((n) => n + 1);
      }
    },
    [hasRecording, hasTranscript],
  );

  const value = useMemo<JumpState>(
    () => ({
      tab,
      setTab,
      seekSeconds,
      seekNonce,
      scrollTo,
      scrollNonce,
      canJump: hasRecording || hasTranscript,
      jump,
    }),
    [tab, seekSeconds, seekNonce, scrollTo, scrollNonce, hasRecording, hasTranscript, jump],
  );

  return <JumpContext.Provider value={value}>{children}</JumpContext.Provider>;
}

export function useJump(): JumpState {
  const ctx = useContext(JumpContext);
  if (!ctx) throw new Error('useJump must be used inside JumpProvider');
  return ctx;
}

/**
 * A `[m:ss]` chip. Clickable when the page has somewhere to jump to; plain
 * mono text otherwise, so a summary-only link still shows when things were
 * said without offering a button that does nothing.
 */
export function Ts({ seconds, className = '' }: { seconds: number | null | undefined; className?: string }) {
  const { canJump, jump } = useJump();
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const label = timestamp(seconds);
  const base = `inline-flex items-center rounded-[5px] px-1.5 py-[1px] font-mono text-[11px] leading-[1.4] ${className}`;
  if (!canJump) {
    return <span className={`${base} bg-eb-chip text-eb-muted`}>{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        jump(seconds);
      }}
      title={`Jump to ${label}`}
      aria-label={`Jump to ${label}`}
      className={`${base} bg-eb-chip text-eb-secondary hover:bg-eb-accent-soft hover:text-eb-accent-text`}
    >
      {label}
    </button>
  );
}
