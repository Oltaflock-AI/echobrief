-- Meeting audio kept in Cloudflare R2 after Recall's free 7 days.
--
-- Recall retention is 168 h (its free window) since 2026-09-14, so after a week
-- the video and audio at Recall are gone. The daily prune-recordings tick copies
-- each completed meeting's audio_mixed mp3 (~58 MB/hour) into a private R2
-- bucket while Recall still has it; playback falls back to that copy. R2's free
-- tier is 10 GB with no egress fees, and the same tick deletes oldest-first to
-- stay under ARCHIVE_CAP_BYTES in _shared/recording-archive.ts.
--
-- One row per archived object. meeting_id is ON DELETE SET NULL, not CASCADE,
-- on purpose: a meeting deleted from the browser cannot reach R2 (the keys live
-- only in the edge runtime), so the row survives as a tombstone and the next
-- tick deletes the object. Account deletion reaches it the same way — the
-- meetings cascade, meeting_id goes null, the object is swept within a day.
--
-- Service-role only: RLS on, zero policies.

CREATE TABLE IF NOT EXISTS public.recording_archives (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   uuid UNIQUE REFERENCES public.meetings(id) ON DELETE SET NULL,
  object_key   text NOT NULL UNIQUE,
  bytes        bigint NOT NULL DEFAULT 0,
  content_type text NOT NULL DEFAULT 'audio/mpeg',
  archived_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recording_archives_archived_at_idx
  ON public.recording_archives (archived_at);

ALTER TABLE public.recording_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recording_archives FROM anon, authenticated;

-- Meetings whose archive attempt failed (Recall had no audio, upload error) are
-- not retried forever: the tick stamps this and skips them afterwards.
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS archive_attempted_at timestamptz;
