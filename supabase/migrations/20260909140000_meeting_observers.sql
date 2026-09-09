-- Reviewers who see the meeting, not just the mail.
--
-- `summary_recipient_allowlist` already answers "who else gets the summary
-- email": an address on that list that is ALSO on the meeting's invite. That
-- rule is deliberate and it is the one this migration extends — the same
-- person, the same meetings, now visible in their own dashboard instead of
-- only in their inbox.
--
-- Three decisions:
--
-- 1. THE GRANT IS MATERIALISED, not computed in a policy. An RLS policy that
--    re-derived "is this reviewer on the invite?" would have to read
--    `meetings.attendees` (three different shapes) and fall back to
--    `calendar_events` on every row of every query. `_shared/observers.ts`
--    resolves it once when the insights are saved and writes a row here, so the
--    policy is a primary-key lookup and the decision is auditable after the
--    fact.
--
-- 2. IT IS OPT-IN PER REVIEWER. `dashboard_access` defaults to false, so
--    existing allowlist entries keep getting exactly what they get today (an
--    email copy) and nothing more. Dashboard access is the strictly larger
--    grant and has to be asked for.
--
-- 3. IT IS READ-ONLY AND IT COVERS THE TRANSCRIPT. Unlike an org share (which
--    stops at summary + insights because a colleague must not see the pre/post
--    call zones), an observer here is an internal reviewer on the invite — they
--    were in the room. They get what the owner sees; they cannot delete,
--    regenerate, rename or re-share it, because no policy below grants
--    anything but SELECT.

-- ---------------------------------------------------------------------------
-- Who may observe at all
-- ---------------------------------------------------------------------------

ALTER TABLE public.summary_recipient_allowlist
  ADD COLUMN IF NOT EXISTS dashboard_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.summary_recipient_allowlist.dashboard_access IS
  'When true, this reviewer also gets read access to meetings they are invited '
  'to, via a materialised meeting_observers row. Default false: the email copy '
  'is the smaller grant and stays the default.';

UPDATE public.summary_recipient_allowlist
   SET dashboard_access = true
 WHERE lower(email) = 'vineet@oltaflock.ai';

-- ---------------------------------------------------------------------------
-- The grants themselves
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meeting_observers (
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The address that matched the invite. Kept for the audit trail: the profile
  -- email can change afterwards, and then "why can this account see this
  -- meeting?" has no answer anywhere else.
  email      text NOT NULL,
  reason     text NOT NULL DEFAULT 'allowlist_attendee',
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, user_id)
);

-- "Everything I can observe", the query the dashboard runs.
CREATE INDEX IF NOT EXISTS meeting_observers_user_idx
  ON public.meeting_observers (user_id);

ALTER TABLE public.meeting_observers ENABLE ROW LEVEL SECURITY;

-- An observer may see that they were granted access. Nobody may write here
-- from a browser — grants are made by the pipeline with the service role, and
-- an INSERT policy would let any account grant itself any meeting.
DROP POLICY IF EXISTS meeting_observers_select_own ON public.meeting_observers;
CREATE POLICY meeting_observers_select_own ON public.meeting_observers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- SECURITY DEFINER for the same reason the org helpers are: this is called FROM
-- policies on `meetings`, and it must not re-enter RLS. `search_path` is pinned
-- because a definer function without one is hijackable.
CREATE OR REPLACE FUNCTION public.i_observe_meeting(p_meeting uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_observers
     WHERE meeting_id = p_meeting AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.i_observe_meeting(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.i_observe_meeting(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Read policies. SELECT only, on the three tables that make up a meeting.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS meetings_select_observer ON public.meetings;
CREATE POLICY meetings_select_observer ON public.meetings
  FOR SELECT TO authenticated USING (public.i_observe_meeting(id));

DROP POLICY IF EXISTS meeting_insights_select_observer ON public.meeting_insights;
CREATE POLICY meeting_insights_select_observer ON public.meeting_insights
  FOR SELECT TO authenticated USING (public.i_observe_meeting(meeting_id));

-- Unlike the org share above it, this one DOES extend to the transcript: an
-- observer is on the invite, so the pre/post-call zones the org share protects
-- are zones they were present for.
DROP POLICY IF EXISTS transcripts_select_observer ON public.transcripts;
CREATE POLICY transcripts_select_observer ON public.transcripts
  FOR SELECT TO authenticated USING (public.i_observe_meeting(meeting_id));

COMMENT ON TABLE public.meeting_observers IS
  'Read-only grants for allowlisted reviewers who were on a meeting''s invite. '
  'Written by the pipeline (_shared/observers.ts) when insights are saved, and '
  'by scripts/backfill_meeting_observers.py for meetings that predate it.';
