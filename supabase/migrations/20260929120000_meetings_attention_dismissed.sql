-- Dismissing a meeting from the dashboard's "Needs attention" card used to
-- DELETE it — transcript, insights and archived audio included. For a failed
-- meeting that throws away audio a recovery could still use, and it made a
-- one-click "dismiss all" unsafe to offer. Dismissal is now this stamp: the
-- meeting stays, it just leaves the card. Deleting stays on the meeting page.
--
-- Written by the owner through the existing meetings UPDATE policy; no new
-- policy needed.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS attention_dismissed_at timestamptz;
