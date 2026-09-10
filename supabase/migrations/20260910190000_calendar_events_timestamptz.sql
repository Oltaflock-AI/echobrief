-- calendar_events.start_time / end_time are `timestamp WITHOUT time zone`, but
-- Google hands us "2026-09-10T16:00:00+05:30". Postgres drops the offset on
-- the way in, so the row stores a bare 16:00 wall clock. Every reader then
-- filters it against `new Date().toISOString()` — a UTC instant — so an IST
-- calendar reads 5h30m into the past:
--   * a 4:00 pm meeting that finished two hours ago still passes
--     `start_time >= now()` and renders "Bot will join";
--   * anything starting after 18:30 IST falls outside the dashboard's
--     end-of-day bound and disappears from "Today".
--
-- Convert to timestamptz, interpreting the stored wall clock as IST (which is
-- what it is: the offset Google sent and Postgres discarded). Nothing else in
-- the pipeline reads these columns for scheduling — auto-join-meetings works
-- off the provider API response, which still carries its own offset.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calendar_events'
      AND column_name = 'start_time' AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.calendar_events
      ALTER COLUMN start_time TYPE timestamptz
        USING start_time AT TIME ZONE 'Asia/Kolkata';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calendar_events'
      AND column_name = 'end_time' AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE public.calendar_events
      ALTER COLUMN end_time TYPE timestamptz
        USING end_time AT TIME ZONE 'Asia/Kolkata';
  END IF;
END $$;
