# CLAUDE.md

## Project Overview

EchoBrief is an AI meeting intelligence platform. It consists of three main parts:
1. **React web app** (Vite + TypeScript) -- dashboard for viewing meetings, transcripts, insights, calendar, action items, settings
2. **Chrome Extension** (Manifest V3, vanilla JS) -- captures tab audio from Google Meet / Zoom Web meetings
3. **Supabase backend** -- PostgreSQL database, Auth, Storage (audio files), and Deno Edge Functions for processing

## Quick Commands

```bash
npm run dev              # Start Vite dev server (port 8080)
npm run build            # Production build
npm run lint             # ESLint
npm run functions:serve  # Serve Supabase Edge Functions locally (needs supabase/.env.local)
```

## Architecture

### Recording Flow
Extension detects Meet/Zoom → `chrome.tabCapture` → offscreen document runs `MediaRecorder` → uploads WebM to `upload-recording` Edge Function → `process-meeting` dispatches to Sarvam AI (async, webhook callback) or falls back to Whisper → GPT-4o-mini generates insights → saves to DB → optionally delivers to Slack/email.

### Key Files

**Web App:**
- `src/App.tsx` -- Routes, providers (Auth, Recording, Theme, Query)
- `src/contexts/AuthContext.tsx` -- Supabase auth state, signIn/signUp/signOut, password recovery flow detection
- `src/contexts/RecordingContext.tsx` -- Recording state management
- `src/pages/` -- Dashboard, Recordings, MeetingDetail, Calendar, ActionItems, Settings, Auth, Landing

**Chrome Extension:**
- `chrome-extension/background.js` -- Service worker: tab capture, state persistence to chrome.storage, upload logic
- `chrome-extension/offscreen.js` -- MediaRecorder (MV3 can't use this in service workers)
- `chrome-extension/content.js` -- Injected into Meet/Zoom pages, shows recording banner
- `chrome-extension/web-bridge.js` -- Syncs Supabase auth token between web app and extension

**Edge Functions (Deno):**
- `supabase/functions/process-meeting/` -- Orchestrates transcription (Sarvam primary, Whisper fallback) + GPT insight generation
- `supabase/functions/sarvam-webhook/` -- Async callback from Sarvam STT
- `supabase/functions/upload-recording/` -- Accepts audio upload, stores in Supabase Storage
- `supabase/functions/_shared/insights.ts` -- Hallucination detection, GPT prompt, insight saving, delivery
- `supabase/functions/_shared/sarvam.ts` -- Sarvam API client (create job, upload, start)
- `supabase/functions/_shared/recall-pipeline.ts` -- Shared Recall audio download + Sarvam submission logic (used by recall-webhook and check-recall-status)
- `supabase/functions/_shared/cors.ts` -- CORS headers shared across functions

### Database

PostgreSQL with Row-Level Security. Key tables:
- `meetings` -- metadata (title, source, status, audio_url)
- `transcripts` -- transcript text + speaker segments (JSONB)
- `meeting_insights` -- AI output (summary, action_items, decisions, risks, timeline, metrics)
- `profiles` -- user settings, integration flags
- `user_oauth_tokens` -- Google OAuth tokens
- `notion_connections`, `slack_messages`, `meeting_notifications`, `action_item_completions`

All tables enforce `auth.uid() = user_id` RLS policies.

Migrations are in `supabase/migrations/` (16 files).

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router v6, TanStack Query, Framer Motion
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions on Deno)
- **AI:** Sarvam AI (STT + diarization), OpenAI Whisper (fallback STT), GPT-4o-mini (insights)
- **Extension:** Chrome MV3, vanilla JS, tabCapture + offscreen API
- **Integrations:** Google Calendar OAuth, Slack API, Notion OAuth, email delivery
- **Hosting:** Vercel (frontend), Supabase (backend)

## UI Component Library

Uses shadcn/ui (Radix primitives + Tailwind). Components are in `src/components/ui/`. Do not modify these directly -- they are generated.

Custom components are in `src/components/dashboard/`, `src/components/meeting/`, and `src/components/landing/`.

## Brand

See `BRAND.md` for colors (orange/amber gradient primary, stone neutrals), typography (Outfit headings, DM Sans body), and design guidelines.

## Environment Variables

**Frontend (.env):**
- `VITE_SUPABASE_URL` -- Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` -- Supabase anon key

**Edge Functions (Supabase secrets):**
- `OPENAI_API_KEY` -- Required for Whisper + GPT
- `SARVAM_API_KEY` -- Required for Sarvam STT
- Google OAuth client ID/secret
- Slack app credentials

## Auth Flow Notes

- Password recovery detection (`isPasswordRecovery`) lives in `AuthContext` — it is the single source of truth for whether the user is in a password reset flow. It's set synchronously from URL params on init (before Supabase clears the hash) and also via the `PASSWORD_RECOVERY` auth event. `App.tsx` uses this flag to force-render the Auth page during recovery, preventing auto-redirect to dashboard.
- Supabase's recovery token exchange auto-authenticates the user. Any routing logic must check for recovery state **before** checking for an active session, otherwise the user skips the "set new password" form.

## Rules

- **95% confidence rule:** Do not make a code change unless you are 95% confident it is correct. If unsure, explain the concern and ask before changing. This applies to every change — bug fixes, new features, refactors, all of it.

## Conventions

- TypeScript strict mode
- Tailwind for all styling (no CSS modules)
- React Router v6 with `ProtectedRoute` wrapper for auth-gated pages
- TanStack Query for server state, React Context for client state (auth, recording, theme)
- Edge Functions use shared modules from `supabase/functions/_shared/`
- Chrome extension uses vanilla JS (no build step)
