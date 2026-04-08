# EchoBrief Context — Development Reference

**Last Updated:** Apr 2, 2026 3:48 PM IST  
**Status:** Production-ready frontend + backend infrastructure deployed  
**Live URL:** https://echobrief-ten.vercel.app (auto-deploys on git push)

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

## Current Working State (As of Apr 2, 2026)

### ✅ What Works
- **Bot Recording (Dashboard)** — Recall bot joins meetings via URL, records, transcribes, and generates insights (primary recording method in dashboard UI)
- **Chrome Extension MV3** — Records Google Meet/Zoom audio, uploads to Supabase (backend still active; extension UI removed from dashboard to reduce user confusion)
- **Calendar Sync** — Fetches Google Calendar events with attendees
- **Email Delivery** — Meeting summaries and reports sent via Resend (noreply@echobrief.in) — CORS fix deployed Apr 7, 2026
- **Auth Flow** — Signup, login, email verification via Supabase
- **Settings UI** — Tab-based (Account, Bot, Integrations, Security)
- **Meeting Detail Modal** — Comprehensive modal on calendar event click
- **Dashboard UI** — Empty state, loading state, proper UX, bot-only recording
- **Profile Dropdown** — Top-right SaaS-style menu with sign-out

### ⚠️ In Progress / Known Issues
1. **Recall Webhook** — Function deployed but not yet receiving completion events
   - File: `supabase/functions/recall-webhook/index.ts`
   - Issue: Bot may not be sending callback with `video_url` + `transcript`
   - Check: Recall API docs for webhook payload format

2. **Meetings Dashboard Loading** — Meetings list shows "Loading..." forever
   - File: `src/pages/Recordings.tsx` (line ~40)
   - Issue: Query may be filtering by wrong status or `recall_bot_id` column missing
   - Fix: Check if meetings table has `recall_bot_id` column + RLS policies

3. **Attendees Not Saving** — Calendar sync captures attendees but may not store them
   - File: `supabase/functions/sync-calendar-events/index.ts`
   - Status: Fixed Mar 2 — now captures attendees array ✓
   - Verify: attendees JSONB column exists in calendar_events table

4. **Auto-Join Not Working** — Recall bot only joins on manual "Record Now" click
   - Feature: Auto-join toggle in Settings (Integrations tab)
   - Issue: No n8n/scheduled job to check calendar in real-time
   - Workaround: Manual "Record Now" button on calendar events works ✓

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
   - Receives webhooks from Recall (bot status + recording media events)
   - Handles: `bot.done`, `audio_mixed.done`, `bot.fatal`, intermediate statuses
   - On audio ready: downloads from Recall → uploads to Supabase Storage → creates Sarvam job
   - Hands off to sarvam-webhook for transcription + insights

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
  - Columns: id, user_id, recall_bot_id, meeting_url, title, start_time, duration_seconds, transcript, summary, action_items, status, recording_url, error_message
  - RLS: Users can only view/edit their own meetings

- **calendar_events** — Synced Google Calendar events
  - Columns: id, user_id, calendar_id, event_id, title, start_time, end_time, attendees (JSONB), meeting_link
  - RLS: Users can only view their own events

- **calendars** — Connected Google Calendars
  - Columns: id, user_id, calendar_id, calendar_name, is_primary, is_active, last_synced_at
  - RLS: Users can only view/edit their own

- **profiles** — User settings
  - Columns: id, email, bot_name, bot_icon_color, auto_join_meetings, recording_preference (audio_only/audio_video)

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
1. Recall bot leaves meeting → `bot.done` and `audio_mixed.done` webhooks fire
2. `recall-webhook` receives event, downloads audio via `/api/v1/audio_mixed/` API
3. Audio uploaded to Supabase Storage, Sarvam job created + started
4. `sarvam-webhook` receives transcript → GPT generates insights → saves to DB
5. Email/Slack delivery triggered, meeting marked as completed

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
SARVAM_API_KEY=<stored-in-supabase-secrets>
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
```

---

## Quick Commands

```bash
# Local dev (auto-reload)
npm run dev

# Build for production
npm run build

# Deploy edge function to Supabase
supabase functions deploy start-recall-recording --project-ref lekkpfpojlspbuwrtmzt

# Git push (auto-deploys to Vercel)
git push

# Check Supabase logs
supabase functions logs start-recall-recording --project-ref lekkpfpojlspbuwrtmzt --tail
```

---

## Next Steps / Unfinished Work

- [ ] Fix Recall webhook to receive completion events
- [ ] Fix meetings loading bug (Recordings.tsx)
- [ ] Implement auto-join via scheduled n8n workflow
- [ ] Add real-time Realtime subscription to meetings table
- [ ] Build Citara (AEO monitoring SaaS)
- [ ] Build Lumnix (marketing analytics SaaS)

---

**Read this file at the start of every EchoBrief debugging/development session.**
