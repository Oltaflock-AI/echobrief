-- Atomic lock column for check-recall-status → sarvam-webhook re-trigger.
-- Previously the lock reused status="transcribing", which collided with
-- sarvam-webhook's own idempotency guard for the Whisper fallback path
-- and left meetings stuck. A dedicated timestamp column removes the
-- collision: check-recall-status atomically sets it (via WHERE IS NULL)
-- before firing the webhook; concurrent polls fail the conditional update.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS sarvam_webhook_triggered_at TIMESTAMPTZ;
