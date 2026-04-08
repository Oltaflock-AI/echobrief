# EchoBrief

**AI meeting intelligence platform that records meetings, transcribes conversations, extracts decision-grade insights, and delivers structured follow-ups across dashboard, Slack, email, and digest workflows.**

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Edge%20Functions-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Whisper%20%2B%20GPT--4o--mini-412991?logo=openai&logoColor=white)](https://openai.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

---

## Table of Contents

- [Overview](#overview)
- [Why This Project Stands Out](#why-this-project-stands-out)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [End-to-End Flows](#end-to-end-flows)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Design](#database-design)
- [Edge Functions](#edge-functions)
- [Chrome Extension System Design](#chrome-extension-system-design)
- [Engineering Challenges and Problems Faced](#engineering-challenges-and-problems-faced)
- [Technical Highlights](#technical-highlights)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Why This Is Strong SE1 Work](#why-this-is-strong-se1-work)
- [License](#license)

---

## Overview

EchoBrief is a full-stack meeting intelligence product built to solve a practical engineering problem: teams spend too much time in meetings, lose decisions in chat threads, forget action items, and rely on weak note-taking tools that either join as bots or produce low-signal summaries.

This system captures meeting audio in two ways:

- **Recall bot path** (primary, exposed in dashboard UI) for bot-based meeting recordings — user enters a meeting URL and a Recall bot joins to record
- **Chrome Extension path** (backend still active, UI removed from dashboard) for browser meetings using Manifest V3 tab capture and an offscreen recording document

Once a meeting is recorded, EchoBrief pushes the audio through an AI pipeline:

- **Sarvam AI** for primary asynchronous speech-to-text with diarization
- **OpenAI Whisper** as a fallback transcription path
- **GPT-4o-mini** for structured insight generation

The result is not just a transcript. EchoBrief produces:

- executive summaries
- decisions and commitments
- action items with ownership metadata
- timeline-style meeting breakdowns
- delivery to Slack or email
- digest-style recap reports across a week or month

From an engineering perspective, this project demonstrates end-to-end product ownership across frontend, backend, browser extension architecture, database design, OAuth integrations, asynchronous pipelines, and operational edge cases.

---

## Why This Project Stands Out

Most meeting tools stop at transcription. EchoBrief goes deeper in both product and engineering execution.

- **No single-surface app**: this system spans a React SPA, a Chrome MV3 extension, Supabase Edge Functions, PostgreSQL, storage, and third-party AI/integration providers.
- **Real asynchronous workflow design**: transcription is not a synchronous request/response toy flow. Sarvam jobs are submitted asynchronously and completed later by webhook.
- **Multi-provider fault tolerance**: the pipeline automatically falls back from Sarvam to Whisper when needed.
- **Real-world integration complexity**: Google Calendar OAuth, Slack delivery, email delivery, Recall bot orchestration, multi-calendar support, and auth sync between web app and browser extension.
- **Manifest V3 constraints**: Chrome extension recording is implemented with service worker lifecycle handling, offscreen documents, alarm-based keepalive, and persisted state restoration.
- **Portfolio value for recruiters**: the codebase shows the kind of practical full-stack debugging, systems thinking, and product-minded tradeoff handling that entry-level software engineers are expected to grow into quickly.

---

## Key Features

| Area | Capabilities |
|---|---|
| **Recording** | Recall-based meeting bot recording (primary, dashboard UI), Chrome extension recording for Meet and Zoom (backend only, UI removed from dashboard), manual recording controls, active recording UI |
| **Transcription** | Sarvam batch STT with webhook completion, OpenAI Whisper fallback, speaker segmentation, timestamp handling, hallucination filtering |
| **AI Insights** | Executive summary, short summary, action items, decisions, risks, questions, timeline, engagement-style meeting metrics |
| **Calendar** | Google OAuth, multi-calendar support, calendar event syncing, meeting-link extraction, upcoming meeting views |
| **Delivery** | Slack summary delivery, meeting email delivery, scheduled email workflows, digest report generation, WhatsApp report pipeline |
| **Dashboard** | Authenticated dashboard, recordings view, meeting detail view, action item tracking, analytics chart, global search, settings (extension status banner removed — dashboard is bot-only) |
| **User Experience** | Protected routes, onboarding, live status updates, responsive interface, animated transitions |
| **Security** | Supabase Auth, Row Level Security, OAuth state tracking, service-role-only server operations, CORS and rate-limiting helpers |

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                               Client Layer                                  │
│                                                                              │
│  React Web App (Vite + TypeScript)            Chrome Extension (Manifest V3) │
│  - Landing, Auth, Dashboard                   - content.js                   │
│  - Recordings, Calendar, Settings             - background.js                │
│  - Meeting detail, Action items               - offscreen.js                 │
│  - Extension token sync                       - popup.js                     │
│                                              - web-bridge.js                │
└───────────────────────────────┬───────────────────────────────┬──────────────┘
                                │                               │
                                │ queries / auth               │ tab capture
                                ▼                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Supabase Platform                                 │
│                                                                              │
│  - PostgreSQL with RLS                                                       │
│  - Auth                                                                      │
│  - Storage for recorded audio                                                │
│  - Realtime subscriptions                                                    │
│  - Edge Functions for ingest, processing, OAuth, sync, and delivery          │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           External Services                                  │
│                                                                              │
│  - Sarvam AI: primary async STT + diarization                                │
│  - OpenAI: Whisper fallback + GPT-4o-mini insight generation                 │
│  - Google Calendar API: calendar sync                                        │
│  - Slack API: message delivery                                               │
│  - Resend: email delivery                                                    │
│  - Recall AI: bot-based meeting capture                                      │
│  - Notion OAuth: workspace integration hooks                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## End-to-End Flows

### 1. Chrome Extension Recording Flow

1. User opens Google Meet or Zoom in Chrome.
2. `content.js` detects a supported meeting page and surfaces recording UI.
3. `background.js` requests a tab capture stream via `chrome.tabCapture.getMediaStreamId`.
4. Because Manifest V3 service workers cannot use DOM recording APIs directly, recording is delegated to `offscreen.js`.
5. `offscreen.js` records audio using `MediaRecorder`, buffers chunks, and uploads on completion.
6. `upload-recording` stores the audio in Supabase Storage and creates the meeting record.
7. `process-meeting` submits the audio to Sarvam or falls back to Whisper.
8. AI insights are generated and persisted.
9. Results become visible in the dashboard and can be delivered to Slack or email.

### 2. Recall Bot Recording Flow

1. User syncs calendars and selects a meeting with a supported meeting link.
2. `start-recall-recording` creates a Recall recording bot and stores the mapping in `meetings`.
3. Recall sends lifecycle events to `recall-webhook`.
4. Once the bot finishes recording, EchoBrief downloads the audio from Recall.
5. Audio is archived to Supabase Storage, then submitted to Sarvam for transcription.
6. `sarvam-webhook` finishes transcript persistence, insight generation, and downstream delivery.

### 3. Insight Generation Flow

1. Transcript text and speaker segments are normalized.
2. Low-signal transcripts are filtered with hallucination heuristics.
3. GPT-4o-mini produces structured JSON outputs instead of freeform text.
4. Results are stored in `meeting_insights`.
5. Delivery functions format summaries for Slack, email, and digest reports.

---

## Tech Stack

### Frontend

| Technology | Why It Was Used |
|---|---|
| **React 18** | Component-driven SPA architecture |
| **TypeScript** | Shared type safety across UI, Supabase types, and integration layers |
| **Vite** | Fast local iteration and lightweight build tooling |
| **React Router v6** | Protected routes and product-style page organization |
| **TanStack Query** | Server-state fetching and cache management |
| **Tailwind CSS** | Fast styling and design consistency |
| **shadcn/ui + Radix UI** | Accessible, composable UI primitives |
| **Framer Motion** | Page transitions and polished interactions |
| **Recharts** | Dashboard analytics and reporting visuals |

### Backend and Platform

| Technology | Why It Was Used |
|---|---|
| **Supabase Auth** | Authentication and session management |
| **Supabase Postgres** | Relational schema, RLS, and product data model |
| **Supabase Storage** | Audio file storage |
| **Supabase Realtime** | Status updates without polling-heavy UI loops |
| **Supabase Edge Functions (Deno)** | Serverless API layer for processing, OAuth, delivery, and webhooks |

### AI and Integrations

| Technology | Why It Was Used |
|---|---|
| **Sarvam AI** | Primary transcription path with asynchronous processing and diarization |
| **OpenAI Whisper** | Reliable fallback transcription path |
| **GPT-4o-mini** | Structured insight generation from transcripts |
| **Google Calendar API** | Meeting discovery and calendar sync |
| **Slack API** | Delivery of meeting summaries to channels |
| **Resend** | Transactional email delivery |
| **Recall AI** | Bot-driven meeting recording for calendar-based automation |

### Browser Extension

| Technology | Why It Was Used |
|---|---|
| **Chrome Manifest V3** | Modern extension platform required by Chrome |
| **tabCapture API** | Native browser tab audio capture |
| **Offscreen Documents** | Workaround for MV3 service worker API limitations |
| **chrome.storage.local** | Extension-side state persistence and auth token sync |
| **chrome.alarms** | Keepalive and timeout recovery for long-running recording flows |

---

## Project Structure

```text
echobrief/
├── src/
│   ├── components/
│   │   ├── dashboard/              # Dashboard shell, meeting cards, stats, delivery selectors
│   │   ├── landing/                # Public marketing site sections
│   │   ├── meeting/                # Meeting detail tabs, metrics, timeline views
│   │   └── ui/                     # Reusable design-system style primitives
│   ├── contexts/                   # Auth, recording, calendar, theme state
│   ├── hooks/                      # Media recorder, toast, responsive helpers, action item tracking
│   ├── integrations/supabase/      # Client wiring and generated DB types
│   ├── pages/                      # Landing, auth, dashboard, recordings, meeting detail, settings, calendar
│   ├── services/                   # Recall service client
│   └── types/                      # Shared meeting/data types
├── chrome-extension/
│   ├── background.js               # MV3 service worker, state restore, keepalive, upload coordination
│   ├── content.js                  # Meet/Zoom detection and injected UI
│   ├── offscreen.js                # MediaRecorder runtime in offscreen document
│   ├── popup.js                    # Extension popup controls
│   ├── web-bridge.js               # Web app <-> extension auth/status sync
│   ├── mic-permission.*            # Permission flow for microphone mixing
│   └── manifest.json               # MV3 permissions and content scripts
├── supabase/
│   ├── functions/
│   │   ├── process-meeting/        # Main AI pipeline orchestration
│   │   ├── sarvam-webhook/         # Async STT callback handler
│   │   ├── upload-recording/       # Audio ingest from extension
│   │   ├── start-recall-recording/ # Recall bot creation
│   │   ├── recall-webhook/         # Recall lifecycle + handoff to transcription
│   │   ├── google-oauth-*          # OAuth start/callback/redirect flows
│   │   ├── sync-*                  # Calendar and Notion sync entrypoints
│   │   ├── send-*                  # Slack, email, WhatsApp, scheduled delivery
│   │   ├── generate-*              # Digest and meeting insight generation
│   │   └── _shared/                # CORS, rate limit, Sarvam helpers, insight helpers
│   ├── migrations/                 # Schema evolution and feature rollout history
│   └── config.toml
├── docs/                           # Build plans and migration notes
├── public/                         # Static assets and icons
└── package.json
```

---

## Database Design

The current schema supports both the original extension-first recording flow and the newer automation flows around calendars, Recall, and digest reporting.

### Core Tables

```sql
profiles
meetings
transcripts
meeting_insights
action_item_completions
```

### Integration and Scheduling Tables

```sql
user_oauth_tokens
google_oauth_states
calendars
calendar_events
notion_connections
slack_messages
meeting_notifications
```

### Database Design Notes

- **`meetings` is the center of the product model**: it connects recording source, processing state, transcript, insights, and delivery.
- **RLS is enabled broadly**: user-scoped tables enforce data isolation at the database level.
- **Schema evolution is visible in migrations**: the repo includes migrations for Sarvam support, Recall integration, multi-calendar support, onboarding tracking, digest reports, and email delivery tracking.
- **JSONB is used selectively** for flexible fields like attendees, speaker data, action items, and processing configuration.

---

## Edge Functions

| Function | Purpose |
|---|---|
| `upload-recording` | Receives extension audio, stores it, creates meeting rows |
| `process-meeting` | Main ingest pipeline, Sarvam submitter, Whisper fallback path |
| `sarvam-webhook` | Handles async Sarvam callbacks and downstream completion |
| `start-recall-recording` | Creates a Recall bot and starts bot-based meeting capture |
| `check-recall-status` | Polls Recall API for live bot status, syncs DB, and triggers the Sarvam pipeline when recording finishes |
| `recall-webhook` | Receives Recall status events and hands completed audio into the AI pipeline |
| `google-oauth-start` / `google-oauth-callback` / `google-oauth-redirect` | Google Calendar OAuth flow |
| `sync-google-calendar` / `sync-calendars` / `fetch-calendar-events` | Calendar sync and event retrieval utilities |
| `send-slack-message` | Delivers summaries to Slack |
| `send-meeting-email` / `send-meeting-summary-email` / `send-email-report` | Email delivery and reporting flows |
| `generate-digest-report` | Builds weekly/monthly meeting digest reports |
| `send-whatsapp-report` | WhatsApp-style report delivery pipeline |
| `generate-meeting-insights` | Insight generation endpoint support |
| `sync-notion` / `notion-oauth-*` | Notion integration plumbing |
| `queue-onboarding-emails` / `send-scheduled-emails` | Lifecycle and scheduled communications |

This function layer is one of the strongest parts of the project because it shows real backend decomposition rather than a single overloaded server file.

---

## Chrome Extension System Design

The Chrome extension is not a basic popup toy. It is a multi-context browser system with:

- `content.js` running inside meeting pages
- `background.js` running as an MV3 service worker
- `offscreen.js` handling recording APIs unavailable to the service worker
- `popup.js` exposing user controls
- `web-bridge.js` syncing auth state from the web app

### Why This Is Technically Interesting

- **Manifest V3 service workers are ephemeral**. Long-running recording cannot rely on in-memory state.
- **Media recording cannot happen directly in the service worker**. An offscreen document is required.
- **State has to survive worker restarts**. Recording metadata is persisted to `chrome.storage.local`.
- **The UI must remain correct across multiple runtime contexts**. Popup, content script, and offscreen recording state all have to stay aligned.
- **Meeting detection avoids broad `tabs` permission scanning**. Detection is delegated to content scripts loaded only on relevant hosts.

---

## Engineering Challenges and Problems Faced

This section is intentionally detailed because the hardest part of this project was not generating a pretty UI. It was making a fragile, multi-runtime, multi-provider system reliable enough to feel like a real product.

### 1. Manifest V3 service worker restarts broke long-running recordings

**Problem:** recordings could outlive the background service worker, causing the extension to lose track of active state.

**Why it happened:** MV3 background scripts are not persistent. Chrome can terminate the worker even while recording is logically still in progress.

**What I changed:**

- persisted recording state in `chrome.storage.local`
- restored state during worker startup
- verified offscreen document existence during restore
- added `chrome.alarms` keepalive handling

**Why this matters:** this is a real distributed-state problem inside the browser. Solving it required treating the extension as a system of unreliable processes rather than a single app.

### 2. MediaRecorder could not run in the service worker

**Problem:** direct recording from `background.js` was not possible.

**Why it happened:** MV3 service workers do not have DOM access and cannot use APIs like `MediaRecorder` the same way a document context can.

**What I changed:**

- created an offscreen document
- forwarded stream setup from the service worker into `offscreen.js`
- used message passing for start/stop lifecycle coordination

**Why this matters:** this is the key architectural workaround that makes Chrome-native meeting capture possible without a visible recording tab.

### 3. Stop-recording race conditions caused UI and upload inconsistencies

**Problem:** a stop action could clear state too early, preventing the final completion message from reaching the right tab.

**Why it happened:** asynchronous completion messages arrived after the service worker had already nulled out key identifiers like `tabId`.

**What I changed:**

- split "mark recording stopped" from "fully reset all state"
- delayed destructive cleanup until `RECORDING_COMPLETED` or failure signals arrived
- added a safety timeout alarm to recover when completion never arrives

**Why this matters:** this is a classic async coordination bug across runtime boundaries.

### 4. UI state diverged across popup, content script, and recorder

**Problem:** the popup could say "ready" while the page UI still showed a recording state, or the page indicator could remain after stop.

**Why it happened:** multiple independent execution contexts were each rendering state derived from partial information.

**What I changed:**

- centralized recording truth in persisted extension state
- added cleanup paths for every recording-end state
- used periodic state verification to detect mismatches

**Why this matters:** debugging cross-context UI consistency is much closer to distributed systems debugging than normal component debugging.

### 5. Low-signal audio created transcript hallucinations

**Problem:** silence, noisy recordings, or weak meeting audio could still return convincing but wrong transcript text.

**Why it happened:** speech models can hallucinate repetitive filler or common phrases when input quality is poor.

**What I changed:**

- added hallucination heuristics before insight generation
- filtered repetitive transcripts and known junk output patterns
- treated empty/invalid transcripts as a separate product state instead of letting bad input contaminate downstream summaries

**Why this matters:** building AI products requires defensive engineering around model failure modes, not blind trust in API responses.

### 6. Browser-only recording and bot-based recording needed to coexist

**Problem:** the product evolved from a Chrome-extension-only recorder into a platform that also supports Recall-based recording initiated from calendar events.

**Why it happened:** extension capture is great for manual browser usage, but automated meeting workflows need bot-style joining and recording.

**What I changed:**

- added Recall integration and webhook handling
- unified both recording paths under the same `meetings -> transcript -> insights -> delivery` pipeline
- preserved one downstream processing model even though ingest mechanisms differ

**Why this matters:** this demonstrates architectural adaptability without rewriting the whole backend.

### 7. Multi-calendar support changed the original data model

**Problem:** the earlier Google-calendar-linked model was too narrow once users needed multiple calendars and more flexible event sync.

**Why it happened:** a single-calendar assumption breaks quickly in real productivity products.

**What I changed:**

- introduced `calendars` and `calendar_events` tables
- added provider metadata, active flags, sync configuration, and indexes
- updated settings and calendar pages to read from the new model

**Why this matters:** this is a good example of schema evolution driven by product requirements, not just code cleanup.

### 8. Extension auth had to work without a second login flow

**Problem:** requiring users to sign in separately inside the extension would create friction and duplication.

**Why it happened:** the web app and extension run in separate contexts with different storage and auth boundaries.

**What I changed:**

- added `web-bridge.js` and `ExtensionTokenSync`
- synced the Supabase auth token through extension storage
- let extension uploads authenticate as the signed-in web user

**Why this matters:** this creates a smoother product while showing practical understanding of auth boundary design.

### 9. Long-running workflows required async webhook-driven backend design

**Problem:** STT processing and meeting bot lifecycles do not fit a simple request/response model.

**Why it happened:** Sarvam completes later via callback, and Recall bots emit independent status changes over time.

**What I changed:**

- designed the pipeline around persistent meeting status updates
- stored provider job identifiers in the database
- used webhooks to re-enter the pipeline safely when external systems completed work

**Why this matters:** this is production-style backend design, not tutorial CRUD.

### 10. Delivering polished summaries required product thinking, not just backend completion

**Problem:** even after transcription and summarization worked, the output still needed to reach users in formats they would actually use.

**What I changed:**

- added Slack delivery
- added meeting email delivery
- added weekly/monthly digest generation
- tracked delivery flows separately from core meeting processing

**Why this matters:** good engineering is not only about model output. It is about delivering the right output in the right workflow.

### 11. A race condition in the Recall webhook created two transcription jobs per meeting

**Problem:** every completed Recall meeting was generating two separate Sarvam transcription jobs, wasting API quota and producing non-deterministic results.

**Why it happened:** Recall fires two distinct webhook events almost simultaneously when a recording finishes — `audio_mixed.done` (audio file is ready for download) and `bot.done` (bot lifecycle is complete). The handler was listening to both. Both events arrived within milliseconds of each other, both read `sarvam_job_id = null` from the database, and both triggered the full audio download → upload → Sarvam job creation pipeline in parallel before either had a chance to write the new job ID back.

**What I changed:**

- restricted `recall-webhook` to only trigger `processRecallAudio` on `audio_mixed.done` — the authoritative signal that the MP3 is actually downloadable
- `bot.done` is now treated as a status-only update and does not initiate any pipeline work
- `check-recall-status` polling already acts as a fallback for the rare case where `audio_mixed.done` is never received

**Why this matters:** this is a real race condition in a distributed webhook system. The fix required understanding the semantic difference between two events from an external API and recognizing that "database reads are not atomic with writes across concurrent executions."

### 12. A silent recording caused an infinite webhook retry loop that never resolved

**Problem:** a 23-second meeting where participants left immediately got permanently stuck on "Processing" and never completed — even though the transcription pipeline had technically already finished.

**Why it happened:** a chain of failures:

1. Sarvam completed the job successfully but wrote no output file — correct behavior when the audio contains no speech
2. The webhook handler tried to download that file, received a 400 "does not exist" response, and threw an unhandled exception, returning a 500 to the caller
3. The `check-recall-status` polling function was triggering `sarvam-webhook` every 5 seconds as a fallback, but silently ignored the 500 response and kept retrying
4. This created a permanent loop: Sarvam done, webhook crashes, poller retries, webhook crashes again — indefinitely

**What I changed:**

- added a try/catch in `sarvam-webhook` around the Sarvam file download call
- when the download returns 400 "does not exist", the handler now substitutes an empty transcript instead of throwing
- the meeting completes gracefully with a "no clear speech detected" message instead of staying stuck forever

**Why this matters:** this is the kind of edge case that only surfaces in production with real data. Sarvam was behaving correctly — it just had nothing to output. The bug was entirely in the error handling layer, and it created a silent infinite loop with no obvious signal that anything was wrong. Catching it required reading logs across three separate functions and tracing the retry path manually.

---

## Technical Highlights

### Dual Ingest Architecture

EchoBrief supports both:

- **browser-native capture** through the extension
- **bot-driven capture** through Recall

That is a meaningful architecture decision because it decouples the downstream intelligence layer from the recording source.

### Multi-Provider AI Pipeline

The system is designed with graceful degradation:

- Sarvam is the primary transcription path
- Whisper is the fallback path
- GPT-4o-mini only runs after transcript validation

This reduces brittleness and makes the system more realistic than single-provider demos.

### Structured Insight Generation

Summaries are not stored as one blob of generated text. The system aims for structured outputs that can power:

- meeting detail tabs
- action item tracking
- digest reports
- Slack/email formatting

That makes the AI output application-ready rather than merely readable.

### Backend Modularity

The Edge Function layer is decomposed by responsibility:

- ingest
- processing
- webhooks
- sync
- delivery
- OAuth

This is a cleaner design than a monolithic API file and makes the project easier to extend.

### Schema Evolution

The migration history shows the product growing over time:

- baseline meeting and transcript support
- Sarvam migration
- storage improvements
- Recall integration
- multi-calendar support
- onboarding and delivery tracking
- digest reporting

This is useful signal to recruiters because it shows iterative engineering, not one-shot scaffolding.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Chrome
- Supabase project
- Supabase CLI for local function work

### Install

```bash
git clone https://github.com/your-username/echobrief.git
cd echobrief
npm install
```

### Frontend Environment

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

### Edge Function Environment

Create `supabase/.env.local`:

```env
OPENAI_API_KEY=sk-...
SARVAM_API_KEY=...
SARVAM_WEBHOOK_SECRET=...
RESEND_API_KEY=...
SLACK_BOT_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
RECALL_API_KEY=...
```

### Run the Web App

```bash
npm run dev
```

### Run Edge Functions Locally

```bash
supabase start
supabase db push
npm run functions:serve
```

### Load the Chrome Extension

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click `Load unpacked`
4. Select the `chrome-extension/` directory
5. Sign in on the web app so auth token sync can initialize

---

## Environment Variables

| Variable | Used For |
|---|---|
| `VITE_SUPABASE_URL` | Frontend Supabase client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend auth and database access |
| `VITE_SUPABASE_PROJECT_ID` | Project identification in frontend flows |
| `OPENAI_API_KEY` | Whisper transcription fallback and GPT-4o-mini insights |
| `SARVAM_API_KEY` | Primary transcription provider |
| `SARVAM_WEBHOOK_SECRET` | Sarvam callback validation |
| `RESEND_API_KEY` | Email delivery |
| `SLACK_BOT_TOKEN` | Slack delivery |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `RECALL_API_KEY` | Recall bot orchestration |
| `SUPABASE_URL` | Edge Function server-side Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged database/storage operations |

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build production frontend |
| `npm run build:dev` | Development-mode build |
| `npm run preview` | Preview built frontend |
| `npm run lint` | Run ESLint |
| `npm run functions:serve` | Serve Supabase Edge Functions locally |
| `npm run extension:zip` | Package Chrome extension into a zip file |

---

## Why This Is Strong SE1 Work

For a Software Engineer 1 candidate, this project shows much more than the ability to build pages or call an AI API.

- It demonstrates **full-stack ownership** across frontend, backend, browser extension, and database layers.
- It shows **debugging maturity** through concrete handling of race conditions, state recovery, lifecycle issues, and provider failures.
- It includes **system integration work** with real OAuth, webhooks, third-party APIs, and async pipelines.
- It reflects **product-minded engineering** by connecting technical implementation to user workflows like summaries, digests, calendar-driven automation, and delivery channels.
- It gives reviewers clear evidence of **scaling beyond tutorial projects** into architecture, reliability, and iteration.

If I were reviewing this as an engineering manager or recruiter, the strongest signal would be that the project solves messy real-world problems rather than only polished happy-path demos.

---

## License

This project is for portfolio and demonstration purposes.
