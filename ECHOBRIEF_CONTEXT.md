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
- **Recall AI** — Bot meeting recording (Teams/Zoom)
  - API Key: `6d5b5f5bf401869ffc061797ba5cd9f2e2f7f020`
  - Endpoint: `https://api.recall.ai/api/v2`
- **Google Calendar API** — Calendar sync & event fetch
- **Sarvam AI** — Real-time STT for Indian languages
  - API Key: `sk_g9gcx19q_F3701xwAFplbozPOu6wayNYF`
- **GPT-4o-mini** — Meeting summarization & insights

---

## Current Working State (As of Apr 2, 2026)

### ✅ What Works
- **Chrome Extension MV3** — Records Google Meet/Zoom audio, uploads to Supabase
- **Calendar Sync** — Fetches Google Calendar events with attendees
- **Bot Dispatch (Manual)** — Sends Recall bot to join Teams/Zoom on demand
- **Email Delivery** — Meeting summaries sent via Resend (noreply@echobrief.in)
- **Auth Flow** — Signup, login, email verification via Supabase
- **Settings UI** — Tab-based (Account, Bot, Integrations, Security)
- **Meeting Detail Modal** — Comprehensive modal on calendar event click
- **Dashboard UI** — Empty state, loading state, proper UX
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
  - Shows time, attendees, meeting link, two recording options
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
   - Calls Recall API `/recordingbots` to create bot
   - Saves meeting record to DB with `recall_bot_id`
   - Returns: `{ bot_id, status }`

2. **recall-webhook** — `supabase/functions/recall-webhook/index.ts`
   - Receives webhook from Recall API when bot finishes
   - Payload: `{ bot_id, status, video_url, transcript }`
   - Updates meetings table with recording_url + transcript
   - ⚠️ **NOT YET RECEIVING EVENTS** — check Recall webhook config

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
6. Function calls Recall API `/recordingbots` to join Teams/Zoom
7. Meeting record created in DB with `recall_bot_id` + `status: 'recording'`
8. Modal shows loading spinner → changes to "Bot is joining..." on success
9. Recall bot joins meeting and records

### 3. Bot Finishes Recording (When Webhook Works)
1. Recall bot leaves meeting
2. Recall API sends webhook to `recall-webhook` edge function
3. Webhook updates meetings table: `recording_url`, `transcript`, `status: 'processing'`
4. Frontend polls meetings table or receives Realtime update
5. On next page load or via polling, summary is generated
6. Email sent to user with summary + action items

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
SUPABASE_URL=https://lekkpfpojlspbuwrtmzt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
RECALL_API_KEY=6d5b5f5bf401869ffc061797ba5cd9f2e2f7f020
SARVAM_API_KEY=sk_g9gcx19q_F3701xwAFplbozPOu6wayNYF
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
