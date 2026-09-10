-- Workspace sharing that actually shares the meeting.
--
-- 20260901200000 gave an org share two RLS policies — `meetings` and
-- `meeting_insights` — and stopped there, with a comment saying transcripts
-- needed "its own opt-in and its own zone-stripping read path". Until that
-- existed, "Share with your workspace" handed a colleague a summary and left
-- the transcript and the recording behind, which is not what anyone reads the
-- toggle to mean.
--
-- The read path now exists (`get-org-transcript`, reusing the same
-- `publicSegments` whitelist a public link goes through), and the recording is
-- authorised in `get-recording-media`. Both consult `_shared/org-access.ts`,
-- which reads the include_transcript / include_recording flags this table has
-- carried since 20260902. So this migration has two jobs:
--
--   1. turn those flags ON for org shares, including the ones already written —
--      unlike a public link, whose default-false exists so a link already in a
--      stranger's inbox can never widen, an org share reaches colleagues who
--      are inside the account's own workspace, and it was created to mean
--      "my team can see this meeting";
--   2. add the setting that makes sharing automatic, so it stops being a thing
--      to remember per meeting.
--
-- What is deliberately NOT here: an RLS policy on `transcripts`. RLS cannot
-- filter elements inside a JSONB array, so a policy would grant the whole
-- transcript, pre/post-meeting zones and all. That is exactly the leak the
-- edge function exists to prevent, and adding the policy would silently
-- reopen it.

-- 1. Existing org shares mean what the toggle said they meant.
UPDATE public.meeting_shares
   SET include_transcript = true,
       include_recording  = true
 WHERE scope = 'org'
   AND revoked_at IS NULL
   AND (include_transcript IS DISTINCT FROM true OR include_recording IS DISTINCT FROM true);

-- 2. "Share new meetings with my workspace automatically."
--
-- Per user, not per organisation: each member decides whether their OWN
-- meetings flow to the team. Forward-only by construction — the pipeline writes
-- the share row as insights land (`_shared/org-share.ts`), and nothing here
-- reaches back over meetings that already completed.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_share_to_org boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.auto_share_to_org IS
  'When true and the user is in a workspace, the pipeline shares each newly '
  'completed meeting with that workspace (meeting_shares scope=org). Applies '
  'to new meetings only; turning it on never shares past meetings.';

COMMENT ON COLUMN public.meeting_shares.include_transcript IS
  'Whether this share carries the MEETING-ZONE transcript. Default false for '
  'public links (a link already sent can never widen); set true for org shares, '
  'which are read by colleagues inside the same workspace. Enforced in '
  'get-shared-meeting and get-org-transcript, never by RLS — RLS cannot filter '
  'elements inside a JSONB array.';

COMMENT ON COLUMN public.meeting_shares.include_recording IS
  'Whether this share carries the recording. The mp4 is the WHOLE call, '
  'waiting-room audio included — zones cannot trim it — which is why it is a '
  'separate flag from the transcript. Enforced in get-shared-meeting and '
  'get-recording-media.';
