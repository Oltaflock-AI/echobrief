# CLAUDE.md

## Project Overview

EchoBrief is an AI meeting intelligence platform. It consists of three main parts:
1. **React web app** (Vite + TypeScript) -- dashboard for viewing meetings, transcripts, insights, calendar, action items, settings
2. **Chrome Extension** (Manifest V3, vanilla JS) -- captures tab audio from Google Meet / Zoom Web meetings (backend only; extension UI has been removed from the dashboard — all dashboard recording is bot-only via Recall)
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
**Dashboard (bot-only):** User enters a meeting URL → `start-recall-recording` creates a Recall bot (with real-time transcription enabled via `recallai_streaming`) → bot joins and records → `recall-webhook` receives `audio_mixed.done` event → audio downloaded from Recall + Recall transcript fetched (via `media_shortcuts.transcript` download URL) for real participant names → audio submitted to Sarvam AI in translate mode (async, webhook callback) or falls back to Whisper → `sarvam-webhook` maps each Sarvam segment to real participant names using per-segment time-overlap matching against Recall's speaker timeline → GPT-4o-mini generates insights → saves to DB → optionally delivers to Slack/email.

**Chrome Extension (backend still active, UI removed from dashboard):** Extension detects Meet/Zoom → `chrome.tabCapture` → offscreen document runs `MediaRecorder` → uploads WebM to `upload-recording` Edge Function → same processing pipeline as above.

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
- `supabase/functions/_shared/sarvam.ts` -- Sarvam API client (create job, upload, start). Uses `mode: "translate"` to output English regardless of source language, with `with_diarization: true`.
- `supabase/functions/_shared/recall-pipeline.ts` -- Shared Recall audio download + Sarvam submission logic (used by recall-webhook and check-recall-status). Fetches Recall's transcript via `media_shortcuts.transcript` download URL (the old `/bot/{id}/transcript/` endpoint is deprecated) to extract real participant names and build a speaker timeline (speaker name + time range) stored in `processing_config` for per-segment mapping in sarvam-webhook.
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

Migrations are in `supabase/migrations/` (17 files, including `20260414000001_enable_realtime_meetings.sql` for Supabase Realtime on the meetings table).

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router v6, TanStack Query, Framer Motion
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions on Deno)
- **AI:** Sarvam AI (STT in translate mode — outputs English from any language), OpenAI Whisper (fallback STT), GPT-4o-mini (insights)
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
- `RESEND_API_KEY` -- Required for email delivery via Resend
- `RECALL_API_KEY` -- Required for bot-based meeting recording
- Google OAuth client ID/secret
- Slack app credentials

## Auth Flow Notes

- Password recovery detection (`isPasswordRecovery`) lives in `AuthContext` — it is the single source of truth for whether the user is in a password reset flow. It's set synchronously from URL params on init (before Supabase clears the hash) and also via the `PASSWORD_RECOVERY` auth event. `App.tsx` uses this flag to force-render the Auth page during recovery, preventing auto-redirect to dashboard.
- Supabase's recovery token exchange auto-authenticates the user. Any routing logic must check for recovery state **before** checking for an active session, otherwise the user skips the "set new password" form.

## Rules

- **95% confidence rule:** Do not make a code change unless you are 95% confident it is correct. If unsure, explain the concern and ask before changing. This applies to every change — bug fixes, new features, refactors, all of it.

- **Test before committing or deploying:** After making any change — whether it's a frontend tweak, Edge Function update, or migration — verify it actually works before committing or deploying. For frontend changes, run `npm run build` to catch type errors and confirm the dev server renders correctly. For Edge Functions, run `npm run functions:serve` and exercise the relevant endpoint. For database migrations, apply locally and check the result. Don't assume a change works just because it looks right — confirm it. Only then commit and deploy.

## Conventions

- TypeScript strict mode
- Tailwind for all styling (no CSS modules)
- React Router v6 with `ProtectedRoute` wrapper for auth-gated pages
- TanStack Query for server state, React Context for client state (auth, recording, theme)
- Edge Functions use shared modules from `supabase/functions/_shared/`
- Chrome extension uses vanilla JS (no build step)

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
