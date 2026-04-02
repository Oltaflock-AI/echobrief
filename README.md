# EchoBrief

**AI-powered meeting intelligence platform that records, transcribes, and generates decision-grade insights from your meetings, delivered instantly to Slack, email, or your dashboard.**

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Sarvam AI](https://img.shields.io/badge/Sarvam-Saaras%20v3%20STT-000000?logo=data:image/svg+xml;base64,&logoColor=white)](https://sarvam.ai)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?logo=openai&logoColor=white)](https://openai.com)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension%20MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Supabase Edge Functions](#supabase-edge-functions)
- [Chrome Extension](#chrome-extension)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Bugs Encountered and Fixed](#bugs-encountered-and-fixed)
- [Technical Highlights](#technical-highlights)

---

## Overview

EchoBrief solves the problem of meeting fatigue and lost context. Instead of scrambling to take notes, EchoBrief sits in the background, capturing audio from Google Meet or Zoom via a Chrome extension, transcribing it with Sarvam AI's Saaras v3 model (with OpenAI Whisper as an automatic fallback), and running it through a custom GPT-4o-mini pipeline that produces executive summaries, action items with ownership, risk flags, strategic insights, and timestamped timelines. Summaries are automatically delivered to Slack channels or email, and everything is searchable from a polished React dashboard.

### What makes this different from Otter.ai / Fireflies?

- **No bot joins your call.** EchoBrief uses Chrome's Tab Capture API to record audio natively from the browser tab, so there's no awkward "Notetaker Bot has joined" moment.
- **Decision-grade insights, not just transcripts.** The AI pipeline acts as a "chief of staff," producing structured reports with strategic insights, risk flags, confidence-scored action items, and speaker attribution.
- **Full-stack, self-hosted architecture.** Built on Supabase (Postgres, Edge Functions, Auth, Storage, Realtime), giving you complete ownership of your data.

---

## Key Features

| Category | Features |
|---|---|
| **Recording** | Chrome extension with auto-detection for Google Meet & Zoom, tab audio capture via Offscreen API, manual recording from web dashboard |
| **AI Transcription** | Sarvam Saaras v3 (primary) with speaker diarization, translation, and timestamps; OpenAI Whisper as automatic fallback |
| **AI Insights** | Executive summary, strategic insights, speaker-attributed highlights, prioritized action items (with owner, confidence, expected outcome), decisions & commitments, risks & blockers, chronological timeline |
| **Meeting Metrics** | Engagement score, sentiment analysis, speaker participation breakdown |
| **Integrations** | Google Calendar sync (OAuth 2.0 with token refresh), Slack delivery (channel selection), email summaries (Resend), Notion sync (OAuth) |
| **Dashboard** | Meeting list with status badges, global search, stats cards, meeting analytics chart, action item tracker, calendar view |
| **UX** | Dark/light theme, animated page transitions (Framer Motion), responsive layout, pre-meeting notifications, real-time status updates via Supabase Realtime |
| **Security** | Supabase Auth (email/password), Row Level Security on all tables, encrypted storage, CORS protection, rate limiting |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                  │
│                                                                          │
│  ┌─────────────────────┐         ┌─────────────────────────────────┐    │
│  │   Chrome Extension  │         │         React Web App           │    │
│  │   (Manifest V3)     │         │    (Vite + TypeScript + TW)     │    │
│  │                     │         │                                  │    │
│  │  • Tab Capture API  │         │  • Dashboard    • Meeting Detail│    │
│  │  • Auto-detection   │ tokens  │  • Calendar     • Action Items  │    │
│  │  • Offscreen Doc    │◄───────►│  • Settings     • Recordings    │    │
│  │  • MediaRecorder    │  sync   │  • Global Search                │    │
│  └────────┬────────────┘         └──────────┬──────────────────────┘    │
│           │ upload                           │ queries / subscriptions   │
└───────────┼──────────────────────────────────┼──────────────────────────┘
            │                                  │
            ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE PLATFORM                               │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │   Auth   │  │ Postgres │  │ Storage  │  │ Realtime │  │  Edge    │ │
│  │          │  │   (RLS)  │  │(audio)   │  │(live     │  │Functions │ │
│  │ email/pw │  │          │  │          │  │ updates) │  │  (Deno)  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └─────┬────┘ │
│                                                                  │      │
└──────────────────────────────────────────────────────────────────┼──────┘
                                                                   │
                    ┌──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SERVICES                                │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Sarvam AI    │  │ Google       │  │ Slack    │  │ Resend       │   │
│  │ Saaras v3    │  │ Calendar     │  │ API      │  │ (Email)      │   │
│  │ (+ Whisper   │  │ OAuth 2.0   │  │          │  │              │   │
│  │  fallback)   │  │              │  │          │  │              │   │
│  │ GPT-4o-mini  │  │              │  │          │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────┘  └──────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 18** | UI framework with concurrent features |
| **TypeScript** | Type-safe development across the entire frontend |
| **Vite** | Build tool with HMR for fast development |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | 50+ accessible, composable UI components |
| **React Router v6** | Client-side routing with protected routes |
| **TanStack Query** | Server state management, caching, and real-time sync |
| **Framer Motion** | Page transitions and micro-animations |
| **date-fns** | Lightweight date manipulation |
| **Recharts** | Meeting analytics charting |

### Backend
| Technology | Purpose |
|---|---|
| **Supabase** | Backend-as-a-service (Auth, Postgres, Storage, Realtime, Edge Functions) |
| **PostgreSQL** | Relational database with Row Level Security |
| **Deno** | Runtime for Supabase Edge Functions |
| **Supabase Realtime** | WebSocket subscriptions for live meeting status updates |
| **Supabase Storage** | Private bucket for audio file storage (WebM) |

### AI / ML
| Technology | Purpose |
|---|---|
| **Sarvam Saaras v3** | Primary STT — async batch API with speaker diarization, Hindi/English translation, and timestamps. Processes via webhook callback. |
| **OpenAI Whisper** | Fallback STT — used automatically if Sarvam submission fails or if a Sarvam job fails. Provides word-level timestamps and segment data. |
| **GPT-4o-mini** | Meeting insight generation (structured JSON output). In the Whisper path, also handles speaker attribution against known attendees. |

### Integrations
| Integration | Implementation |
|---|---|
| **Google Calendar** | Full OAuth 2.0 flow with PKCE, token refresh, event sync |
| **Slack** | Bot token integration, Block Kit formatted messages, channel selection |
| **Email** | Resend API for formatted meeting summary emails |
| **Notion** | OAuth 2.0 flow for workspace sync |

### Chrome Extension
| Technology | Purpose |
|---|---|
| **Manifest V3** | Modern Chrome extension architecture |
| **Tab Capture API** | Native browser audio capture (no bot required) |
| **Offscreen Documents** | Background audio recording without visible windows |
| **chrome.storage** | Auth token synchronization with web app |

---

## How It Works

```
  ┌─────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
  │  RECORD  │ ──► │TRANSCRIBE│ ──► │ ANALYZE  │ ──► │ DELIVER  │
  └─────────┘      └──────────┘      └──────────┘      └──────────┘

  Chrome ext        Sarvam Saaras     GPT-4o-mini       Slack / Email
  detects Meet/     v3 (async) with   produces           formatted
  Zoom, captures    diarization &     decision-grade     Block Kit
  tab audio via     translation       insights as        messages or
  MediaRecorder     (Whisper fallback) structured JSON   HTML emails
```

**Detailed flow:**

1. **Detection**. The Chrome extension monitors browser tabs for Google Meet (`meet.google.com`) and Zoom (`*.zoom.us`) URLs, displaying a notification banner when a meeting is detected.

2. **Recording**. User clicks "Start Recording" in the extension popup. The extension requests `tabCapture` permission, creates an Offscreen Document, and begins recording via `MediaRecorder` API, capturing all tab audio without any bot joining the call.

3. **Upload**. When recording stops, the audio (WebM) is uploaded to Supabase Storage via the `upload-recording` Edge Function, which creates a meeting record and triggers processing.

4. **Transcription (Sarvam path — default)**. The `process-meeting` Edge Function downloads the audio and submits it to Sarvam's async Batch STT API (Saaras v3, `translate` mode, diarization enabled). The function saves the `sarvam_job_id` on the meeting and returns immediately. When Sarvam finishes processing, it calls the `sarvam-webhook` Edge Function with the results, including a diarized transcript with speaker labels (`SPEAKER_00`, `SPEAKER_01`, etc.) and timestamps.

5. **Transcription (Whisper fallback)**. If Sarvam API keys are not configured, if job submission fails, or if Sarvam reports a failed job, the system automatically falls back to OpenAI Whisper (`whisper-1`) with `verbose_json` response format. In this path, GPT-4o-mini performs speaker attribution by analyzing transcript segments against the known attendee list.

6. **Insight Generation**. The speaker-labeled transcript is fed into a carefully engineered GPT-4o-mini prompt that produces a structured JSON report: executive summary, strategic insights, action items (with owner, priority, confidence, expected outcome), decisions, risks, timeline entries, and meeting metrics.

7. **Delivery**. Insights are saved to the database and optionally delivered to a Slack channel (using Block Kit for rich formatting) and/or emailed via Resend. The dashboard updates in real-time via Supabase Realtime subscriptions.

---

## Project Structure

```
echobrief/
├── src/
│   ├── components/
│   │   ├── dashboard/                # Dashboard UI (14 components)
│   │   │   ├── DashboardLayout.tsx   # Sidebar + header shell
│   │   │   ├── RecordingButton.tsx   # Start/stop recording control
│   │   │   ├── GlobalRecordingPanel  # Floating active recording panel
│   │   │   ├── ExtensionStatus.tsx   # Chrome extension status indicator
│   │   │   ├── MeetingCard.tsx       # Meeting list item with actions
│   │   │   ├── MeetingStatusBadge    # Processing/completed/failed badges
│   │   │   ├── SlackDeliverySelector # Slack channel picker
│   │   │   ├── PreMeetingNotification# Upcoming meeting alerts
│   │   │   ├── StatsCards.tsx        # Key metrics cards
│   │   │   ├── MeetingsChart.tsx     # Recharts analytics chart
│   │   │   ├── GlobalSearch.tsx      # Search across meetings
│   │   │   ├── Header.tsx           # Top bar with search + user menu
│   │   │   ├── Sidebar.tsx          # Navigation sidebar
│   │   │   └── PageTransition.tsx   # Framer Motion page wrapper
│   │   ├── landing/                  # Public landing page (6 components)
│   │   │   ├── Navbar.tsx / Hero.tsx / Features.tsx
│   │   │   ├── HowItWorks.tsx / CTA.tsx / Footer.tsx
│   │   ├── meeting/                  # Meeting detail views
│   │   │   ├── MeetingTabs.tsx      # Summary / Transcript / Action Items / Timeline
│   │   │   ├── TimelineView.tsx     # Chronological event timeline
│   │   │   └── MeetingMetrics.tsx   # Engagement, sentiment, participation
│   │   └── ui/                       # 50+ shadcn/ui components
│   ├── contexts/
│   │   ├── AuthContext.tsx           # Session management, sign in/up/out
│   │   ├── RecordingContext.tsx      # Recording state machine
│   │   └── ThemeContext.tsx          # Dark/light theme toggle
│   ├── hooks/
│   │   ├── useAudioRecorder.ts      # Browser MediaRecorder abstraction
│   │   ├── useActionItemCompletions # Action item completion tracking
│   │   ├── useToast.ts             # Toast notification hook
│   │   └── use-mobile.tsx          # Responsive breakpoint detection
│   ├── integrations/supabase/
│   │   ├── client.ts               # Supabase client singleton
│   │   └── types.ts                # Auto-generated database types
│   ├── pages/                       # Route-level page components
│   │   ├── Landing.tsx / Auth.tsx / Dashboard.tsx
│   │   ├── MeetingDetail.tsx / Recordings.tsx
│   │   ├── Settings.tsx / Calendar.tsx / ActionItems.tsx
│   │   └── NotFound.tsx / Index.tsx
│   └── types/meeting.ts             # Shared TypeScript interfaces
├── chrome-extension/
│   ├── manifest.json                # MV3 manifest with permissions
│   ├── background.js                # Service worker (state, capture, alarms)
│   ├── content.js                   # Meeting pages: recording banner UI + detection
│   ├── web-bridge.js                # Web app: extension marker + token/status relay
│   ├── popup.html / popup.js        # Extension popup (auth, controls, status)
│   ├── offscreen.html / offscreen.js# Offscreen document (MediaRecorder + IndexedDB buffer)
│   └── icons/                       # Extension icons (16, 48, 128px)
├── supabase/
│   ├── functions/                   # 15 Deno Edge Functions
│   │   ├── process-meeting/         # Core AI pipeline (Sarvam submit + Whisper fallback)
│   │   ├── sarvam-webhook/          # Receives Sarvam async callback, processes results
│   │   ├── upload-recording/        # Audio upload handler
│   │   ├── google-oauth-start/      # OAuth initiation
│   │   ├── google-oauth-callback/   # OAuth token exchange
│   │   ├── google-oauth-redirect/   # Post-auth redirect
│   │   ├── disconnect-google/       # Revoke Google connection
│   │   ├── get-google-client-id/    # Client ID for frontend
│   │   ├── sync-google-calendar/    # Calendar event sync
│   │   ├── notion-oauth-start/      # Notion OAuth
│   │   ├── notion-oauth-callback/   # Notion token exchange
│   │   ├── sync-notion/             # Notion data sync
│   │   ├── send-slack-message/      # Slack Block Kit delivery
│   │   ├── test-slack-connection/   # Slack health check
│   │   ├── send-meeting-email/      # Email via Resend
│   │   └── _shared/                 # CORS, rate limiting, Sarvam helpers, insight generation
│   ├── migrations/                  # 16 SQL migrations
│   └── config.toml                  # Supabase project config
├── public/                          # Static assets (logo, favicon)
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── eslint.config.js
```

---

## Database Schema

```sql
-- Core tables
profiles              -- User profiles, integration flags, preferences
meetings              -- Meeting metadata (title, source, times, status, audio_url, attendees, sarvam_job_id, processing_config)
transcripts           -- Full transcript, speaker segments, word-level timestamps, stt_provider, language_detected
meeting_insights      -- AI output (summary, action_items, decisions, risks, timeline, metrics)
action_item_completions -- Tracks completed action items per user

-- Integration tables
user_oauth_tokens     -- Google OAuth access/refresh tokens with expiry
google_oauth_states   -- CSRF protection for OAuth flow
notion_connections    -- Notion workspace and database IDs
slack_messages        -- Slack delivery log (channel, status, message_ts, errors)
meeting_notifications -- Pre-meeting notification schedule and status
```

### Entity Relationship

```
profiles ──────────┐
   │                │
   │ 1:N            │ 1:1
   ▼                ▼
meetings       user_oauth_tokens
   │
   ├── 1:1 ──► transcripts
   │
   ├── 1:1 ──► meeting_insights
   │
   ├── 1:N ──► slack_messages
   │
   ├── 1:N ──► meeting_notifications
   │
   └── 1:N ──► action_item_completions
```

All tables have **Row Level Security** enabled, restricting access so users can only read and modify their own data.

---

## Supabase Edge Functions

| Function | Method | Description |
|---|---|---|
| `upload-recording` | POST | Validates auth, uploads audio to Storage, creates meeting record, returns meeting ID |
| `process-meeting` | POST | Downloads audio → submits to Sarvam Batch API (async) → returns immediately. Falls back to Whisper → GPT-4o-mini speaker attribution → insight generation → Slack/email delivery if Sarvam is unavailable. |
| `sarvam-webhook` | POST | Receives Sarvam async callback → validates auth token → downloads diarized transcript → runs GPT-4o-mini insight generation → saves transcript + insights → triggers Slack/email delivery. Falls back to Whisper on job failure. |
| `google-oauth-start` | GET | Generates OAuth state, stores in DB, redirects to Google consent screen |
| `google-oauth-callback` | GET | Exchanges auth code for tokens, stores encrypted tokens, redirects to app |
| `google-oauth-redirect` | GET | Final redirect after OAuth completion |
| `disconnect-google` | POST | Removes stored tokens, updates profile flags |
| `get-google-client-id` | GET | Returns Google client ID for frontend OAuth buttons |
| `sync-google-calendar` | POST | Fetches upcoming events via Google Calendar API (with automatic token refresh), upserts to meetings table. Includes rate limiting. |
| `send-slack-message` | POST | Sends meeting summary to specified Slack channel using Block Kit formatted messages |
| `test-slack-connection` | POST | Validates Slack bot token and channel access |
| `send-meeting-email` | POST | Sends formatted HTML meeting summary via Resend |
| `notion-oauth-start` | GET | Initiates Notion OAuth 2.0 flow |
| `notion-oauth-callback` | GET | Exchanges Notion auth code for access token |
| `sync-notion` | POST | Syncs meeting data to connected Notion database |

---

## Chrome Extension

### Manifest V3 Permissions

```json
{
  "permissions": ["activeTab", "tabCapture", "storage", "offscreen", "alarms"],
  "host_permissions": ["https://meet.google.com/*", "https://*.zoom.us/*", "https://*.supabase.co/*"]
}
```

### Architecture

```
┌──────────────┐    messages     ┌──────────────┐    chrome.storage    ┌──────────┐
│  content.js  │ ◄────────────► │ background.js│ ◄──────────────────► │ popup.js │
│ (meet/zoom)  │                │(service worker)│                     │          │
│ • Banner UI  │                │ • Tab capture  │                     │ • Login  │
│ • Status     │                │ • State mgmt   │                     │ • Status │
│ • Detection  │                │ • Alarms       │                     │ • Controls│
└──────────────┘                └───────┬────────┘                     └──────────┘
                                        │
┌──────────────┐                        │ stream
│web-bridge.js │                        ▼
│ (web app)    │                ┌──────────────┐
│ • Marker     │                │ offscreen.js │
│ • Token sync │                │              │
│ • Status     │                │ • MediaRec.  │
└──────────────┘                │ • IndexedDB  │
                                │ • WebM out   │
                                └──────────────┘
```

**Key implementation details:**

- **Tab Capture API**. Records tab audio without joining the meeting as a bot participant. No meeting attendee sees any notification of recording.
- **Offscreen Document**. Required by Manifest V3 since service workers can't access DOM APIs. The offscreen document runs `MediaRecorder` to encode the captured audio stream as WebM.
- **Token Sync**. The web app writes the Supabase auth token to `chrome.storage.local`. The extension reads this token to authenticate uploads, avoiding a separate login flow.
- **Auto-detection**. The content script runs only on Meet/Zoom pages (declared in manifest `content_scripts`) and notifies the background service worker when a meeting is detected. This avoids needing the `tabs` permission, which would scan every tab update browser-wide.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)
- Chrome browser (for extension)

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/echobrief.git
cd echobrief
npm install
```

### 2. Environment Setup

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

For Edge Functions, create `supabase/.env.local`:

```env
OPENAI_API_KEY=sk-...
SARVAM_API_KEY=sk_...
SARVAM_WEBHOOK_SECRET=your-generated-secret
RESEND_API_KEY=re_...
SLACK_BOT_TOKEN=xoxb-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 3. Run the Web App

```bash
npm run dev
```

The app starts at `http://localhost:8080`.

### 4. Load the Chrome Extension

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `chrome-extension/` directory
5. Log in on the web app; the extension automatically syncs your session

### 5. Run Supabase Locally (Optional)

```bash
supabase start
supabase db push
npm run functions:serve
```

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` | Supabase project URL (frontend) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` | Supabase anon key (frontend) |
| `VITE_SUPABASE_PROJECT_ID` | `.env` | Supabase project ID |
| `OPENAI_API_KEY` | `supabase/.env.local` | GPT-4o-mini insights + Whisper fallback transcription |
| `SARVAM_API_KEY` | `supabase/.env.local` | Sarvam Saaras v3 batch STT API key |
| `SARVAM_WEBHOOK_SECRET` | `supabase/.env.local` | Shared secret for validating Sarvam webhook callbacks (you generate this) |
| `RESEND_API_KEY` | `supabase/.env.local` | Email delivery |
| `SLACK_BOT_TOKEN` | `supabase/.env.local` | Slack message posting |
| `GOOGLE_CLIENT_ID` | `supabase/.env.local` | Google Calendar OAuth |
| `GOOGLE_CLIENT_SECRET` | `supabase/.env.local` | Google Calendar OAuth |
| `SUPABASE_URL` | Auto-injected | Available in Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected | Available in Edge Functions |

---

## Scripts

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `vite` | Start development server with HMR |
| `npm run build` | `vite build` | Production build |
| `npm run build:dev` | `vite build --mode development` | Development build |
| `npm run preview` | `vite preview` | Preview production build locally |
| `npm run lint` | `eslint .` | Run ESLint |
| `npm run functions:serve` | `supabase functions serve --env-file ./supabase/.env.local` | Serve Edge Functions locally |

---

## Bugs Encountered and Fixed

Building a Chrome extension that records live meetings surfaced several non-trivial bugs, most rooted in Chrome's Manifest V3 service worker lifecycle and the coordination between four separate execution contexts (popup, content script, service worker, offscreen document).

### 1. Recording dies after ~3 minutes

**Problem:** Recordings silently stopped working after a few minutes.

**Root cause:** Chrome MV3 kills background service workers after ~30s of inactivity. All recording state (`isRecording`, `tabId`) was stored in-memory, so when the worker restarted, everything reset to `false`. The offscreen document kept recording, but nothing knew about it.

**Fix:** Persisted all recording state to `chrome.storage.local` and restored it on worker restart. Added `chrome.alarms` keepalive (fires every 25s) and offscreen heartbeat messages (every 20s) to prevent the worker from being killed. On restore, validates the offscreen document still exists; if gone, cleans up stale state.

---

### 2. Red "Recording" dot persists after stopping

**Problem:** The recording indicator stayed on screen permanently after clicking stop.

**Root cause:** The `RECORDING_STOPPED` handler updated the status text but never cleared the `setInterval` duration timer. After `hideStatus()` removed the DOM element 3 seconds later, the interval's next tick saw `statusIndicator === null` and recreated it.

**Fix:** Created a single `cleanupRecordingUI()` function that stops the duration timer and state check interval *before* updating the UI. Every recording-end handler (`RECORDING_STOPPED`, `RECORDING_UPLOADED`, `RECORDING_ERROR`) calls it.

---

### 3. Extension shows "Ready" while still recording

**Problem:** The popup showed "Ready to record" even though the offscreen document was actively recording.

**Root cause:** After the service worker died and restarted with a blank slate, the popup queried `GET_RECORDING_STATUS` and got `isRecording: false` even though the offscreen document was still recording audio.

**Fix:** The content script now runs a periodic state check (every 15s) that queries the background for recording status. If there's a mismatch (background says stopped, content still showing recording UI), it surfaces "Recording stopped unexpectedly." Combined with Bug 1's storage persistence fix, the background now returns correct status after restarts.

---

### 4. Race condition losing the tab ID on stop

**Problem:** After stopping a recording, the audio upload would succeed but the content script never received confirmation; the recording banner just hung.

**Root cause:** `stopRecording()` called `resetState()` immediately, which set `tabId = null`. When the offscreen document later sent `RECORDING_COMPLETED`, the background couldn't forward the result to the content script because it no longer knew which tab to message.

**Fix:** `stopRecording()` now only sets `isRecording = false` but preserves `tabId`. Full state reset only happens when `RECORDING_COMPLETED` / `RECORDING_FAILED` arrives (or after a 30s safety timeout).

---

### 5. Garbage transcript from solo test recordings

**Problem:** Testing by playing a YouTube video in another tab during a solo Google Meet produced a nonsensical transcript.

**Root cause:** `tabCapture` only captures the Meet tab's audio output; other participants' voices arriving via WebRTC. In a solo meeting there are no participants, so the tab outputs near-silence. The YouTube audio plays in a different tab entirely. Additionally, the user's own microphone was never captured; only remote audio was.

**Fix:** The offscreen document now requests microphone access in addition to tab audio. If granted, both streams are mixed using the Web Audio API (`AudioContext` + `MediaStreamDestination`). If microphone permission is denied, it falls back gracefully to tab-only audio.

---

### 6. Can't hear meeting audio while recording

**Problem:** During recording, the user couldn't hear any meeting audio through their speakers.

**Root cause:** Chrome's `tabCapture` API mutes the captured tab's audio output by default to prevent feedback loops. The audio was being recorded correctly (transcripts confirmed this), but playback to speakers was suppressed.

**Fix:** This is Chrome's intentional behavior and not a code bug. Documented as a known behavior. The audio is fully captured in the recording; users just need to be aware that tab audio is muted during capture.

---

### 7. High memory usage during long recordings

**Problem:** Users reported the extension consuming excessive memory (100-300+ MB) during long meetings, causing browser sluggishness.

**Root cause:** The offscreen document's `MediaRecorder` fired `ondataavailable` every 1 second, pushing audio Blobs into an in-memory array (`audioChunks[]`). This array grew unbounded for the entire recording duration -- a 1-hour meeting accumulated 3,600 chunks (36-180 MB) all sitting in the JavaScript heap until the recording stopped.

**Fix:** Replaced the unbounded in-memory array with a periodic **IndexedDB flush** strategy. Audio chunks are buffered in a small array (max ~30 chunks / ~30 seconds), then flushed to IndexedDB (disk-backed browser storage) and cleared from memory. On stop, all chunks are read back from IndexedDB, assembled into the final WebM blob for upload, and the store is cleared. Peak JS heap usage is now capped at ~10-15 MB regardless of recording length.

---

### 8. Unnecessary battery drain from `tabs` permission

**Problem:** The extension contributed to noticeable battery drain even when no meeting was active.

**Root cause:** The `tabs` permission granted the background service worker a `chrome.tabs.onUpdated` listener that fired on **every single tab navigation** across the entire browser. Each event woke the service worker to run URL pattern matching, even for completely unrelated pages. This caused hundreds of unnecessary service worker wake-ups per browsing session.

**Fix:** Removed the `tabs` permission entirely. Meeting detection now relies on the content script (which Chrome only injects on matching Meet/Zoom URLs declared in the manifest). When the content script loads on a meeting page, it sends a single `MEETING_PAGE_LOADED` message to the background. The service worker only wakes when actually needed. Additionally, split the content script so the EchoBrief web app gets a lightweight `web-bridge.js` (~50 lines for extension detection and token sync) instead of the full recording UI script (~380 lines).

---

## Technical Highlights

### AI Pipeline Design

The transcription pipeline uses a two-provider strategy with automatic failover:

**Sarvam path (default):**

1. **Job Submission**. `process-meeting` submits the audio to Sarvam's async Batch STT API (Saaras v3, `translate` mode, `with_diarization: true`). A webhook callback URL and shared auth token are included. The function saves the `sarvam_job_id` and returns immediately.
2. **Async Processing**. Sarvam processes the audio asynchronously. On completion, it POSTs to the `sarvam-webhook` Edge Function with the `X-SARVAM-JOB-CALLBACK-TOKEN` header for auth validation.
3. **Diarized Transcript**. The webhook receives speaker-labeled segments (`SPEAKER_00`, `SPEAKER_01`, etc.) with precise timestamps. No additional GPT call is needed for speaker attribution.
4. **Insight Generation**. The diarized transcript is fed into GPT-4o-mini with an engineered prompt that acts as an "intelligent chief of staff," producing a structured JSON report with strict accuracy rules. The prompt instructs the model to treat `SPEAKER_XX` labels as acoustically verified diarization and to map them to attendee names where context is clear.

**Whisper fallback path:**

If Sarvam keys are not configured, job submission fails, or a Sarvam job reports failure, the system seamlessly falls back to the original Whisper pipeline:

1. **Transcription**. Whisper API with `verbose_json` response format returns segment-level and word-level timestamps.
2. **Speaker Attribution**. A GPT-4o-mini call analyzes transcript segments against known attendees, returning attributions with confidence levels (`high` / `medium` / `low`). Low-confidence attributions are discarded.
3. **Insight Generation**. Same GPT-4o-mini prompt as the Sarvam path.

The `stt_provider` field on each transcript records which provider was used (`sarvam` or `whisper`).

### Real-Time Architecture

The dashboard uses **Supabase Realtime** WebSocket subscriptions to reflect meeting status changes (recording → processing → completed) without polling. When the `process-meeting` function updates a meeting's status, the dashboard instantly updates the `MeetingStatusBadge` and makes insights available.

### Chrome Extension: Offscreen Document Pattern

Manifest V3 service workers can't access DOM APIs like `MediaRecorder`. EchoBrief solves this with the **Offscreen Document** pattern:

- `background.js` calls `chrome.offscreen.createDocument()` when recording starts
- `offscreen.js` receives the audio stream and runs `MediaRecorder`
- Encoded WebM chunks are periodically flushed from the in-memory buffer to **IndexedDB** (disk-backed), keeping peak JS heap usage at ~10-15 MB regardless of recording length
- On stop, all chunks are read back from IndexedDB, assembled into a single WebM blob, uploaded, and the IndexedDB store is cleared

### Security Model

- **Row Level Security**. Every database table has RLS policies ensuring users can only access their own meetings, transcripts, insights, and integration data.
- **OAuth State Validation**. Google Calendar OAuth uses server-generated state tokens stored in the database, validated on callback to prevent CSRF attacks.
- **Token Isolation**. OAuth tokens are stored server-side and accessed only via service role key in Edge Functions. The frontend never handles refresh tokens.
- **Rate Limiting**. Calendar sync includes rate limiting to prevent abuse of the Google Calendar API.

### State Management

- **Server state** is managed via TanStack Query with optimistic updates and automatic cache invalidation.
- **Client state** uses React Context for cross-cutting concerns (auth session, recording state, theme).
- **Extension state** syncs via `chrome.storage.local`, bridging the web app and extension without requiring a separate auth flow.

---

## License

This project is for portfolio/demonstration purposes.
/ /   D e p l o y   t r i g g e r  
 