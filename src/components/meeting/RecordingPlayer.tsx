import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Plays back one meeting's recording.
 *
 * The URL is resolved per view by the `get-recording-media` edge function and
 * deliberately not cached in the database: Recall signs its mp4 links and they
 * expire in a few hours. Video streams straight from Recall (a 720p hour is
 * ~1 GB — the whole Supabase bucket), and older meetings that predate video
 * recording fall back to the archived mp3, which prune-recordings clears a few
 * days after transcription. Recall itself drops the video after 7 days (its free
 * storage ceiling). So "nothing to play" is a normal state, not a bug.
 */
interface RecordingMedia {
  kind: 'video' | 'audio' | 'none';
  url?: string;
  video_status?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-card border border-eb-border bg-eb-card px-4 py-8 text-center sm:px-6 sm:py-12"
    >
      <Video size={32} className="mx-auto mb-3 text-eb-muted" strokeWidth={1.5} />
      <p className="font-dmsans text-sm text-eb-prose">{children}</p>
    </div>
  );
}

export function RecordingPlayer({
  meetingId,
  seekSeconds,
  seekNonce,
  onTime,
  className,
  shareToken,
}: {
  meetingId: string;
  /** Jump the media here once it can seek — set by deep links (?t=) and timestamp clicks. */
  seekSeconds?: number | null;
  /**
   * Bumped by the caller on every seek request, so clicking the same timestamp
   * twice still jumps — `seekSeconds` alone would be an unchanged prop.
   */
  seekNonce?: number;
  /** Playback position, for views that follow along (the V2 recording panel). */
  onTime?: (seconds: number) => void;
  /** Overrides the player chrome; the V2 panel supplies its own card. */
  className?: string;
  /**
   * Set on the public share page, where there is no session to read. The share
   * token authorises the request instead, and `get-shared-meeting` refuses it
   * unless that particular link was created carrying the recording.
   */
  shareToken?: string;
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['recording-media', shareToken ? `share:${shareToken}` : meetingId],
    // Well inside the shortest link life the function hands out (1 h for the
    // signed audio URL), so a revisit reuses the link instead of re-signing.
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<RecordingMedia> => {
      const response = shareToken
        ? await fetch(`${SUPABASE_URL}/functions/v1/get-shared-meeting`, {
            method: 'POST',
            headers: {
              // The anon key is a public value; the share token is what
              // actually authorises this read.
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: shareToken, resource: 'recording' }),
          })
        : await (async () => {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            if (!token) throw new Error('Not signed in');
            return fetch(`${SUPABASE_URL}/functions/v1/get-recording-media`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ meeting_id: meetingId }),
            });
          })();
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Failed to load recording');
      return body as RecordingMedia;
    },
  });

  // Apply the requested seek once the element exists and knows its duration.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || seekSeconds == null) return;
    const apply = () => {
      try {
        el.currentTime = seekSeconds;
        void el.play()?.catch(() => {});
      } catch {
        // Not seekable (still loading, expired URL) — the timestamp is a
        // convenience, never worth an error state.
      }
    };
    if (el.readyState >= 1) apply();
    else el.addEventListener('loadedmetadata', apply, { once: true });
    return () => el.removeEventListener('loadedmetadata', apply);
  }, [seekSeconds, seekNonce, data?.url]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-card border border-eb-border py-16">
        <Loader2 className="h-6 w-6 animate-spin text-eb-muted" />
      </div>
    );
  }

  if (isError) {
    return (
      <Placeholder>
        Could not load the recording.{' '}
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 font-medium text-eb-accent-text"
        >
          <RefreshCw size={12} strokeWidth={1.75} /> Try again
        </button>
      </Placeholder>
    );
  }

  if (data?.kind === 'video' && data.url) {
    return (
      <video
        key={data.url}
        ref={mediaRef as React.RefObject<HTMLVideoElement>}
        src={data.url}
        controls
        preload="metadata"
        onTimeUpdate={onTime ? (e) => onTime(e.currentTarget.currentTime) : undefined}
        className={className ?? 'w-full rounded-card border border-eb-border bg-eb-sidebar'}
      />
    );
  }

  if (data?.kind === 'audio' && data.url) {
    return (
      <div className="rounded-card border border-eb-border bg-eb-card p-5">
        <p className="mb-3 font-dmsans text-[13px] text-eb-prose">
          No video for this meeting — playing the archived audio.
        </p>
        <audio
          key={data.url}
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={data.url}
          controls
          preload="metadata"
          onTimeUpdate={onTime ? (e) => onTime(e.currentTarget.currentTime) : undefined}
          className="w-full"
        />
      </div>
    );
  }

  if (data?.video_status === 'processing') {
    return (
      <Placeholder>
        The video is still being prepared by the recorder.{' '}
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 font-medium text-eb-accent-text"
        >
          <RefreshCw size={12} strokeWidth={1.75} /> Check again
        </button>
      </Placeholder>
    );
  }

  return (
    <Placeholder>
      No recording is available for this meeting. Recordings expire 7 days after the
      meeting.
    </Placeholder>
  );
}
