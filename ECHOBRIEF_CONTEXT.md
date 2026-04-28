# EchoBrief Context — Development Reference

**Last Updated:** Apr 28, 2026
**Status:** Production-ready, with reliability sprint in progress (pipeline test harness + stuck-meeting monitor cron now live)
**Live URL:** https://echobrief.in (auto-deploys on git push)

---

## Stack

### Frontend
- **React 18 + Vite** — Fast dev/prod builds
- **TypeScript** — Type safety
- **Tailwind CSS + shadcn/ui** — UI components
- **date-fns** — Date formatting
- **lucide-react** — Icons

### Backend & Infrastructure
- **Supabase** — Auth, Postgres, Storage, Realtime, Edge Functions (Deno)
  - Project ID: `lekkpfpojlspbuwrtmzt`
  - URL: `https://lekkpfpojlspbuwrtmzt.supabase.co`
- **Vercel** — Frontend hosting (auto-deploys on git push)
- **Resend** — Email delivery (noreply@echobrief.in)

### Third-Party APIs
- **Recall AI** — Bot meeting recording (Teams/Zoom/Google Meet)
  - API Key: stored in Supabase secrets
  - Endpoint: `https://<region>.recall.ai/api/v1` (region set via RECALL_API_BASE_URL)
- **Google Calendar API** — Calendar sync & event fetch
- **Sarvam AI** — Real-time STT for Indian languages
  - API Key: stored in Supabase secrets
- **GPT-4o-mini** — Meeting summarization & insights

---

## Current Working State (As of Apr 28, 2026)

### ✅ What Works
- **Bot Recording (Dashboard)** — Recall bot joins meetings via URL, records, transcribes via Sarvam (with auto-Whisper fallback), and generates insights via GPT-4o-mini.
- **Chrome Extension MV3** — Records Google Meet/Zoom audio, uploads to Supabase (backend still active; extension UI removed from dashboard).
- **Calendar Sync** — Fetches Google Calendar events with attendees.
- **Email Delivery** — Meeting summaries and reports via Resend (noreply@echobrief.in). Stuck-meeting alerts via Resend → `amaan@oltaflock.ai`.
- **Auth Flow** — Signup, login, email verification, password recovery via Supabase.
- **Settings, Meeting Detail Modal, Dashboard UI, Profile Dropdown** — all stable.
- **Pipeline Test Harness** — `python3 scripts/pipeline-test/harness.py`. 8 scenarios, ~90 seconds. Run before every edge function deploy.
- **Stuck-Meeting Monitor** — pg_cron job runs every 5 min, classifies stuck meetings into signatures (see [`errors.md`](errors.md)), attempts auto-recovery, emails admin when it can't.
- **Auto-Whisper Fallback** — `sarvam-webhook` automatically falls back to `process-meeting` with `forceWhisper: true` on any Sarvam download failure (covers the known `KeyError: 'timestamps'` server bug on long audio).

### ⚠️ Known Open Issues

1. **Sarvam `KeyError: 'timestamps'` on audio > ~7 min** — Sarvam server-side bug, reported on Discord with 6 reproducer job IDs (5 different config combos), awaiting their fix. Mitigation: `sarvam-webhook` auto-falls-back to Whisper, so meetings are not stuck on this alone.

2. **Whisper OOM (`WORKER_RESOURCE_LIMIT`) on audio > ~15 MB** — the `process-meeting` Whisper path loads the full audio blob into memory three times (download → File → multipart body), exceeding Supabase's edge function memory budget. Affects audio over ~15 minutes. Manual recovery: run [`/tmp/recover_meeting.py`](/tmp/recover_meeting.py) which transcribes locally. Permanent fix on the roadmap: rewrite Whisper call to stream from Supabase Storage signed URL via manually-built multipart body with `duplex: "half"`. See `errors.md` `whisper:oom`.

3. **Auto-join cron** — `auto-join-meetings` runs every minute and dispatches Recall bots for upcoming calendar events. Working in production. ✓

### 🛠️ Recent Reliability Fixes (Apr 22–28, 2026)

1. **`bot.done` / `audio_mixed.done` race** — `bot.done` was overwriting `status = failed` on meetings whose `audio_mixed.done` was still mid-flight. Fixed: `bot.done` now queries Recall's `/audio_mixed/` endpoint to confirm before failing. (`recall-webhook/index.ts`)
2. **`transcribing` deadlock** — `check-recall-status` and `sarvam-webhook` were communicating through the `status` field with conflicting meanings. Fixed by adding `meetings.sarvam_webhook_triggered_at` as a dedicated atomic lock column. (migration `20260422170000_sarvam_webhook_trigger_lock.sql`)
3. **Missing `error_message` column** — every failure-path UPDATE was silently rejected by PostgREST because the column didn't exist. Meetings stuck in `processing` instead of transitioning to `failed`. Fixed by migration `20260424170000_meetings_error_message.sql`. The harness now covers this regression.
4. **Phantom `SPEAKER_01` for solo meetings** — Sarvam segments outside Recall's confidence-gated speech windows fell back to acoustic labels even when only one participant was present. Fixed with single-participant fast path + nearest-neighbor fallback. (`sarvam-webhook/index.ts`)
5. **Sarvam silent-empty-output** — `sarvam-webhook` previously only fell back to Whisper on a specific 400 error; now it falls back on any download failure. (`sarvam-webhook/index.ts`)

---

## Critical File Locations

### Pages (User-Facing)
- **Dashboard (Meetings)** — `src/pages/Recordings.tsx`
  - Fetches meetings from `meetings` table
  - Shows empty state or list with filters
  - Issue: Loading state may be stuck (line ~40)

- **Calendar** — `src/pages/Calendar.tsx`
  - Fetches Google Calendar events
  - Opens meeting detail modal on event click
  - "Record Now" button dispatches bot
  - Function: `handleRecordWithBot()` → calls `start-recall-recording` edge function

- **Settings** — `src/pages/Settings.tsx`
  - Tab-based UI (Account, Bot, Integrations, Security)
  - Bot customization (name, icon color)
  - Recall recording preferences (auto-join toggle, audio/video)
  - Google Calendar connection/disconnect

### Components
- **MeetingDetailModal** — `src/components/dashboard/MeetingDetailModal.tsx`
  - Opens on calendar event click
  - Shows time, attendees, meeting link, bot recording option (extension toggle removed)
  - State: `botStatus` (idle/loading/joined/error)
  - Calls: `handleSendBot()` → `onRecordWithBot` prop

- **Header** — `src/components/dashboard/Header.tsx`
  - Top navigation bar with search + notifications + profile dropdown
  - Profile dropdown: avatar button with menu (Profile, Settings, Sign out)
  - Escape key + outside click closes menu

- **Sidebar** — `src/components/dashboard/Sidebar.tsx`
  - Left navigation (Meetings, Calendar, Action Items, Settings)
  - Collapsible on small screens

### Edge Functions (Supabase Deno)
1. **start-recall-recording** — `supabase/functions/start-recall-recording/index.ts`
   - POST body: `{ meeting_url, user_id, calendar_event_id, title }`
   - Calls Recall API `POST /api/v1/bot/` to create bot with `audio_mixed_mp3` config
   - Saves meeting record to DB with `recall_bot_id`
   - Returns: `{ success, meeting_id, recall_bot_id, status }`

2. **recall-webhook** — `supabase/functions/recall-webhook/index.ts`
   - Receives webhooks from Recall (bot status + recording media events).
   - Handles: `bot.done`, `audio_mixed.done`, `bot.fatal`, `bot.call_ended` (with failure sub_codes), intermediate statuses.
   - **`audio_mixed.done` is the only event that triggers `processRecallAudio`** (audio download + Sarvam handoff). `bot.done` does not initiate pipeline work — it only updates status, and only marks `failed` if Recall's `/audio_mixed/` endpoint confirms `failed`/`missing` (race-safe).
   - Hands off to `sarvam-webhook` for transcription + insights.

2b. **monitor-stuck-meetings** — `supabase/functions/monitor-stuck-meetings/`
   - Scheduled every 5 min via `pg_cron` (migration `20260425170100_monitor_stuck_meetings_cron.sql`).
   - Detects meetings in non-terminal status > 15 min, classifies into a known signature, attempts canonical recovery, logs every detection to `monitor_events`, emails `amaan@oltaflock.ai` via Resend on recovery failure or unknown signature.
   - `known-patterns.ts` mirrors the human-readable runbook in `errors.md`. Update both together.

3. **generate-meeting-summary** — `supabase/functions/generate-meeting-summary/index.ts`
   - POST body: `{ transcript, meeting_id, user_id }`
   - Calls GPT-4o-mini to generate summary + action_items
   - Returns: `{ summary, action_items }`

4. **send-meeting-summary-email** — `supabase/functions/send-meeting-summary-email/index.ts`
   - POST body: `{ meeting_id, user_id, email, summary, action_items }`
   - Calls Resend API to send email from noreply@echobrief.in
   - Tracks delivery in email_messages table

5. **sync-calendar-events** — `supabase/functions/sync-calendar-events/index.ts`
   - Fetches events from connected Google Calendars
   - Stores in calendar_events table with attendees
   - Called manually by "Sync Now" button or on Settings tab open

6. **google-oauth-redirect** — `supabase/functions/google-oauth-redirect/index.ts`
   - OAuth callback handler
   - Saves calendar to calendars table
   - Auto-fetches events after OAuth

---

## Database Schema

### Key Tables
- **meetings** — Recording metadata
  - Columns include: id, user_id, recall_bot_id, meeting_url, title, start_time, end_time, duration_seconds, status, audio_url, sarvam_job_id, processing_config (JSONB), error_message, sarvam_webhook_triggered_at
  - `error_message` was added Apr 25, 2026 — failure paths in edge functions had been silently no-op'ing because the column didn't exist
  - `sarvam_webhook_triggered_at` is the atomic lock used by `check-recall-status` to claim a Sarvam-webhook re-fire (added Apr 23, 2026, replaces the earlier `transcribing` status sentinel)
  - RLS: users can only view/edit their own meetings

- **transcripts** — Transcript content
  - Columns: id, meeting_id, content, speakers (JSONB), word_timestamps (JSONB), stt_provider ("sarvam" or "whisper"), language_detected

- **meeting_insights** — GPT-generated structured outputs
  - Columns: meeting_id, summary_short, summary_detailed, key_points, action_items, decisions, risks, follow_ups, strategic_insights, open_questions, speaker_highlights, timeline_entries, meeting_metrics

- **monitor_events** — Audit trail of stuck-meeting detections (added Apr 28, 2026)
  - Columns: id, meeting_id, error_signature, is_new_pattern, recovery_attempted, recovery_succeeded, email_sent, details (JSONB), created_at, hour_bucket (generated)
  - Unique index on (meeting_id, error_signature, hour_bucket) — dedupes within the hour
  - Service-role only (RLS enabled, no user-facing access)

- **calendar_events** — Synced Google Calendar events
  - Columns: id, user_id, calendar_id, event_id, title, start_time, end_time, attendees (JSONB), meeting_link
  - RLS: users can only view their own events

- **calendars** — Connected Google Calendars
  - Columns: id, user_id, calendar_id, calendar_name, is_primary, is_active, last_synced_at

- **profiles** — User settings
  - Columns: id, email, bot_name, bot_icon_color, auto_join_meetings, recording_preference, slack_connected, slack_channel_id

- **user_oauth_tokens** — OAuth credentials
  - Columns: user_id, google_access_token, google_refresh_token

- **email_messages** — Delivery tracking
  - Columns: id, user_id, email, meeting_id, status, sent_at, error_message

---

## Common Workflows

### 1. User Connects Calendar
1. User clicks "Add Calendar" in Settings → Integrations
2. Google OAuth popup opens
3. User authorizes calendar access
4. Redirect to `google-oauth-redirect` edge function
5. Function saves calendar to `calendars` table
6. Function fetches initial events via `sync-calendar-events` logic
7. Events stored in `calendar_events` table with attendees

### 2. User Records Meeting Manually
1. User navigates to Calendar page
2. Clicks on a calendar event → Meeting Detail Modal opens
3. Modal shows: time, attendees, meeting link, two recording options
4. User clicks "Send Bot to Join"
5. Modal calls `handleRecordWithBot()` → invokes `start-recall-recording` edge function
6. Function calls Recall API `POST /api/v1/bot/` to join Teams/Zoom/Meet
7. Meeting record created in DB with `recall_bot_id` + `status: 'recording'`
8. Modal shows loading spinner → changes to "Bot is joining..." on success
9. Recall bot joins meeting and records

### 3. Bot Finishes Recording
1. Recall bot leaves meeting → `bot.done` and `audio_mixed.done` webhooks fire near-simultaneously.
2. **Only `audio_mixed.done` triggers `processRecallAudio`.** `bot.done` checks Recall's `/audio_mixed/` endpoint to confirm audio status before doing anything (race-safe).
3. `recall-webhook` downloads audio via the `/api/v1/audio_mixed/?recording_id=…` endpoint.
4. Recall's transcript is fetched via `media_shortcuts.transcript.data.download_url` (the legacy `/bot/{id}/transcript/` endpoint is deprecated). Real participant names + a speaker timeline (name + time-range pairs) are extracted.
5. Audio uploaded to Supabase Storage. Sarvam batch job is created + started. Speaker timeline stored in `processing_config` for the webhook step.
6. `sarvam-webhook` receives the callback. **If Sarvam returns a usable transcript:** maps speakers via the single-participant fast-path or per-segment overlap (with nearest-neighbor fallback) against the Recall timeline → calls GPT-4o-mini for insights → saves to DB. **If Sarvam returns an error or empty output:** auto-falls-back to `process-meeting` with `forceWhisper: true`, which runs Whisper + insights.
7. Email/Slack delivery triggered, meeting marked `completed`.

---

## Debugging Checklist

### "Meetings list shows 'Loading...' forever"
- [ ] Check `Recordings.tsx` line ~40 — `loading` state never becomes false
- [ ] Verify `meetings` table exists and has rows for user
- [ ] Check browser console for fetch errors
- [ ] Confirm Supabase RLS allows user to query their own meetings
- [ ] Check if `recall_bot_id` column exists (may cause query to fail)

### "Bot dispatch fails with 'Failed to send bot'"
- [ ] Check real error message in modal (should show Recall API error)
- [ ] Verify `RECALL_API_KEY` environment variable is set in Supabase
- [ ] Check Recall API logs for failed bot creation
- [ ] Verify meeting URL is valid (Google Meet, Zoom, or Teams)

### "Attendees not showing in modal"
- [ ] Verify `attendees` JSONB column exists in `calendar_events` table
- [ ] Check `sync-calendar-events` is capturing attendees from Google Calendar API
- [ ] Manually run "Sync Now" button to refresh calendar
- [ ] Check browser console for parsing errors in `extractAttendees()`

### "Recall webhook not receiving data"
- [ ] Check Recall API webhook configuration (set URL correctly?)
- [ ] Verify webhook endpoint is public (not requiring auth)
- [ ] Check Supabase edge function logs for incoming requests
- [ ] Test with curl: `curl -X POST https://...recall-webhook -H "Authorization: Bearer [token]" -d '{"bot_id":"test","status":"completed"}'`

---

## Environment Variables (Vercel)

```
VITE_SUPABASE_URL=https://lekkpfpojlspbuwrtmzt.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_GOOGLE_OAUTH_CLIENT_ID=...
VITE_API_URL=https://echobrief-ten.vercel.app
```

## Supabase Secrets (Edge Functions)

```
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
RECALL_API_KEY=<stored-in-supabase-secrets>
RECALL_WEBHOOK_SECRET=<stored-in-supabase-secrets>
SARVAM_API_KEY=<stored-in-supabase-secrets>
SARVAM_WEBHOOK_SECRET=<stored-in-supabase-secrets>
OPENAI_API_KEY=sk-proj-...
RESEND_API_KEY=<stored-in-supabase-secrets>     # used by stuck-meeting monitor + meeting summary emails
SLACK_BOT_TOKEN=<stored-in-supabase-secrets>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## Quick Commands

```bash
# Local dev (auto-reload)
npm run dev

# Build for production
npm run build

# Run pipeline test harness BEFORE deploying any edge function
# 8 scenarios, ~90 seconds, hits real prod against deployed code
python3 scripts/pipeline-test/harness.py

# Deploy edge function to Supabase (only after harness passes)
supabase functions deploy <function-name>

# Push migrations
supabase db push

# Git push (auto-deploys to Vercel)
git push

# Check Supabase logs
supabase functions logs <function-name> --tail

# Monitor cron audit trail
# (in Supabase SQL editor)
SELECT * FROM monitor_events ORDER BY created_at DESC LIMIT 50;

# Manually recover a stuck meeting (long-audio Whisper OOM case)
# Edit MEETING_ID at top of file, then run
python3 /tmp/recover_meeting.py
```

---

## Next Steps / Unfinished Work

- [ ] **Whisper OOM fix** — rewrite `process-meeting` Whisper path to stream audio from Supabase Storage signed URL into a manually-built multipart body with `duplex: "half"`. Currently any audio >15 MB OOMs the edge function and requires manual recovery via `/tmp/recover_meeting.py`. See `errors.md` `whisper:oom`.
- [ ] **Sarvam KeyError follow-up** — Sarvam Discord report filed Apr 25 with 6 reproducer job IDs; awaiting their fix. If they don't ship within ~2 weeks, evaluate switching primary STT to Deepgram or AssemblyAI.
- [ ] **Long-audio chunking** — even with Whisper streaming, Whisper has a 25 MB API limit. For meetings >25 min, need ffmpeg-based chunking + concatenation. Defer until needed.
- [ ] **Pre-deploy CI gate** — wrap `supabase functions deploy` in a script that runs the harness first and aborts on failure. Or add a GitHub Actions workflow once the team grows beyond one developer.

---

**Read this file at the start of every EchoBrief debugging/development session.** Pair it with `errors.md` for the operational runbook and `CLAUDE.md` for project rules.
