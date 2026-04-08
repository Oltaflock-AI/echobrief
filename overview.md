# EchoBrief - Project Overview

**EchoBrief** is an AI-powered meeting recorder and note-taker that automatically records Google Meet and Zoom Web meetings, transcribes them, and generates AI summaries with action items, key decisions, and insights. Summaries can be delivered via email or Slack.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Frontend (Web App)](#frontend-web-app)
5. [Chrome Extension](#chrome-extension)
6. [Backend (Supabase)](#backend-supabase)
7. [Database Schema](#database-schema)
8. [Environment & Configuration](#environment--configuration)
9. [Getting Started](#getting-started)

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Chrome         │     │  Web App         │     │  Supabase           │
│  Extension      │────▶│  (React/Vite)    │────▶│  - Database         │
│  - Tab capture  │     │  - Dashboard     │     │  - Auth             │
│  - Auto-record  │     │  - Recordings    │     │  - Storage          │
└─────────────────┘     │  - Settings      │     │  - Edge Functions   │
                        └──────────────────┘     └─────────────────────┘
                                                           │
                                                           ▼
                                                 ┌─────────────────────┐
                                                 │  OpenAI Whisper +   │
                                                 │  GPT (process-      │
                                                 │  meeting)           │
                                                 └─────────────────────┘
```

**Flow (Bot — primary):**
1. User enters a meeting URL in the dashboard
2. Recall bot joins the meeting and records audio
3. On completion, audio is downloaded and submitted to Sarvam AI (or Whisper fallback)
4. GPT-4o-mini generates structured insights from the transcript
5. User views summaries in dashboard; can send to Slack or email

**Flow (Extension — backend only, UI removed from dashboard):**
1. User installs Chrome extension and logs in via web app
2. Extension auto-detects Google Meet / Zoom Web meetings and starts recording
3. Audio is captured via tab capture → uploaded to Supabase Storage
4. Same processing pipeline as above

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, Framer Motion |
| **Auth** | Supabase Auth (email/password) |
| **Backend** | Supabase (PostgreSQL, Edge Functions, Storage, Realtime) |
| **AI** | OpenAI Whisper (transcription), OpenAI GPT (summaries, insights) |
| **Integrations** | Google Calendar OAuth, Slack API, Notion OAuth, Email |
| **Extension** | Chrome Extension Manifest V3 (Vanilla JS) |

---

## Project Structure

```
echobrief/
├── src/                          # React web application
│   ├── components/               # Reusable UI components
│   │   ├── dashboard/            # Dashboard-specific components
│   │   ├── landing/              # Landing page components
│   │   ├── meeting/              # Meeting detail components
│   │   └── ui/                   # shadcn/ui base components
│   ├── contexts/                 # React context providers
│   ├── hooks/                    # Custom React hooks
│   ├── integrations/supabase/    # Supabase client & types
│   ├── pages/                    # Route pages
│   └── types/                    # TypeScript types
├── chrome-extension/             # Chrome extension (unpacked)
│   ├── background.js             # Service worker (tab capture, upload)
│   ├── content.js                # Injected into meeting pages
│   ├── popup.html / popup.js     # Extension popup UI
│   └── manifest.json
├── supabase/
│   ├── functions/                # Edge Functions (Deno)
│   │   ├── process-meeting/      # AI transcription + summarization
│   │   ├── upload-recording/     # Audio upload handler
│   │   ├── google-oauth-*        # Google Calendar OAuth flow
│   │   ├── notion-oauth-*        # Notion OAuth flow
│   │   ├── send-slack-message/   # Send summary to Slack
│   │   ├── send-meeting-email/   # Email summary
│   │   └── sync-google-calendar/ # Sync calendar events
│   └── migrations/               # SQL migrations
├── public/                       # Static assets
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── .env                          # Environment variables
```

---

## Frontend (Web App)

### Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Public landing page |
| `/auth` | Auth | Sign in / Sign up |
| `/dashboard` | Dashboard | Main dashboard with meetings list |
| `/recordings` | Recordings | Recordings view |
| `/meeting/:id` | MeetingDetail | Full meeting view (transcript, insights, tabs) |
| `/settings` | Settings | Profile, Google Calendar, Slack, Notion, notifications |
| `/calendar` | Calendar | Calendar view with meetings |
| `/action-items` | ActionItems | Centralized action items across meetings |
| `*` | NotFound | 404 page |

### Key Components

- **DashboardLayout** – Sidebar + header layout for authenticated pages
- **RecordingButton** – Start/stop recording from web
- **GlobalRecordingPanel** – Floating panel when recording is active
- **MeetingCard** / **MeetingStatusBadge** – Meeting list items
- **MeetingTabs** – Summary, transcript, action items, timeline
- **SlackDeliverySelector** – Choose Slack channel for delivery
- **PreMeetingNotification** – Notifications before upcoming meetings

### Contexts

- **AuthContext** – User session, signIn, signUp, signOut
- **RecordingContext** – Recording state, start/stop, permissions
- **ThemeContext** – Light/dark theme

### Hooks

- **useAudioRecorder** – Browser audio recording
- **useActionItemCompletions** – Action item completion state
- **useToast** – Toast notifications

---

## Chrome Extension

- **Manifest**: V3
- **Permissions**: `activeTab`, `tabCapture`, `storage`, `tabs`, `scripting`
- **Hosts**: `https://meet.google.com/*`, `https://*.zoom.us/*`

### Files

| File | Purpose |
|------|---------|
| `background.js` | Service worker: tab capture, recording, upload, meeting detection |
| `content.js` | Injected into Meet/Zoom: shows recording banner, communicates with background |
| `popup.html` / `popup.js` | Extension popup: login, status, manual controls |

### Behavior

- Detects Meet/Zoom URLs on tab load
- Optionally auto-starts recording after ~5 seconds
- Captures tab audio via `chrome.tabCapture`
- Uploads audio to Supabase via `upload-recording` function
- Stores auth token in `chrome.storage` for upload requests

---

## Backend (Supabase)

### Edge Functions

| Function | Purpose |
|----------|---------|
| `process-meeting` | Transcribes audio (Whisper), generates summary, action items, decisions, timeline, metrics |
| `upload-recording` | Accepts audio upload, stores in Supabase Storage, creates meeting record |
| `google-oauth-start` | Initiates Google OAuth for Calendar |
| `google-oauth-callback` | Handles OAuth callback, stores tokens |
| `google-oauth-redirect` | Redirects after OAuth |
| `disconnect-google` | Disconnects Google account |
| `get-google-client-id` | Returns Google client ID for frontend |
| `sync-google-calendar` | Syncs calendar events to meetings |
| `notion-oauth-start` / `notion-oauth-callback` | Notion OAuth |
| `sync-notion` | Syncs data to Notion |
| `send-slack-message` | Sends meeting summary to Slack channel |
| `test-slack-connection` | Tests Slack config |
| `send-meeting-email` | Emails meeting summary |

### Storage Buckets

- **recordings** – Uploaded meeting audio (WebM)

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `meetings` | Meeting metadata: title, source, start/end, status, audio_url, calendar_event_id |
| `meeting_insights` | AI output: summary, action_items, decisions, risks, key_points, timeline, metrics |
| `transcripts` | Full transcript text, speakers, word_timestamps |
| `profiles` | User profile: full_name, google_calendar_connected, slack_connected, notetaker_name |
| `action_item_completions` | Tracks which action items are marked done |

### Integration Tables

| Table | Purpose |
|-------|---------|
| `user_oauth_tokens` | Google access/refresh tokens |
| `google_oauth_states` | OAuth state for CSRF |
| `notion_connections` | Notion workspace, database IDs |
| `slack_messages` | Slack delivery history (meeting_id, channel, status) |
| `meeting_notifications` | Pre-meeting notification schedule/status |

---

## Environment & Configuration

### Required `.env` Variables

```env
VITE_SUPABASE_URL=https://hxwweanctnkmgjvkxsql.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key from Supabase Dashboard → Settings → API>
VITE_SUPABASE_PROJECT_ID=hxwweanctnkmgjvkxsql
```

### Supabase Secrets (Edge Functions)

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – Auto-injected
- `OPENAI_API_KEY` – Required for `process-meeting` (Whisper transcription + GPT summaries)
- Google OAuth credentials (client ID/secret)
- Slack app credentials

**Local development:** Create `supabase/.env.local` with `OPENAI_API_KEY` (copy from project root `.env`). Then run:
```bash
npm run functions:serve
# or: supabase functions serve --env-file ./supabase/.env.local
```

**Deployed Supabase:** Set `OPENAI_API_KEY` in Supabase Dashboard → Project Settings → Edge Functions → Secrets.

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env` (or ensure `.env` has Supabase values).

### 3. Run Web App

```bash
npm run dev
```

Runs at `http://localhost:8080` (or configured port).

### 4. Load Chrome Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-extension` folder

### 5. Supabase (Optional Local Dev)

```bash
supabase start    # Start local Supabase
supabase db push  # Apply migrations
npm run functions:serve   # Serve Edge Functions with OPENAI_API_KEY from supabase/.env.local
```

### NPM Scripts

| Script | Command |
|--------|---------|
| `dev` | `vite` – dev server |
| `build` | `vite build` – production build |
| `build:dev` | `vite build --mode development` |
| `preview` | `vite preview` – preview production build |
| `lint` | `eslint .` |
| `functions:serve` | `supabase functions serve --env-file ./supabase/.env.local` |

---

## Key Features Summary

- **Recording**: Recall bot recording (primary, dashboard UI), Chrome extension tab capture (backend only, UI removed from dashboard)
- **AI Processing**: Whisper transcription + GPT summarization (action items, decisions, risks, timeline)
- **Integrations**: Google Calendar, Slack, Notion
- **Delivery**: Email summaries, Slack channel delivery
- **Calendar Sync**: Meetings from Google Calendar
- **Pre-meeting Notifications**: Configurable reminders before meetings
- **Action Items**: Track and mark completion across meetings

---

## Notes

- Build succeeds; minor lint warning about `@import` order in CSS
- 19 npm audit vulnerabilities (5 moderate, 14 high) – consider `npm audit fix`
- Extension uses Supabase URL in background.js – update if switching projects
