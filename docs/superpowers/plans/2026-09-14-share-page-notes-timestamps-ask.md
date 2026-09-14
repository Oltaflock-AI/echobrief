# Share page: timestamps, notes by topic, Ask this meeting — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public share page shows timestamped, topic-grouped notes that jump into the recording/transcript, and lets a signed-in viewer ask the meeting a question.

**Architecture:** `get-shared-meeting` widens its payload with a whitelisted facts subset (`publicFacts`); the page gains a `JumpProvider` that owns tab + seek + scroll state and a `<Ts>` chip every timestamped row renders; a new `ask-shared-meeting` function answers one question over the meeting-zone transcript, reusing the quote-locating logic extracted from `chat-transcripts`.

**Tech Stack:** Deno edge functions, React 18 + TanStack Query, deno test.

## Global Constraints
- Spec: `docs/superpowers/specs/2026-09-14-share-page-notes-timestamps-ask-design.md`.
- No pipeline/prompt/migration changes.
- Public payload widening only through `_shared/share-view.ts` whitelists.
- `ask-shared-meeting`: `verify_jwt = true`, user JWT only, `RATE_LIMITS.LLM` on user id.
- Never force a sign-in on the share page.
- `tsconfig.app.json` has `strict: false` — flat nullable shapes, no discriminated unions.
- Run before deploy: `npm run test:unit`, `tsc -p tsconfig.app.json --noEmit`, `npm run build`, `npm run brand:check`, `npm run test:rls`, `python3 scripts/pipeline-test/harness.py`.

---

### Task 1: `publicFacts` whitelist
**Files:** Modify `supabase/functions/_shared/share-view.ts`; Test `supabase/functions/tests/share_view_test.ts`.
**Produces:** `publicFacts(raw: unknown): PublicFacts | null` with `topics[{topic, ts, notes}]`, `numbers[{metric, value, ts}]`, `pain_points[{statement, ts}]`, `explicit_asks[{statement, ts}]`, `decisions[{decision, owner, ts}]`. Returns null when no topics.
- [ ] Failing tests: drops `quote`, `speaker`, `entities`, `objections`, `notable_quotes`, `validation`; null for non-object / no topics; ts coerced to finite ≥0 number.
- [ ] Implement; `npm run test:unit`; commit.

### Task 2: extract `locateQuote`
**Files:** Create `supabase/functions/_shared/quote-locate.ts`; Modify `supabase/functions/chat-transcripts/index.ts`; Test `supabase/functions/tests/quote_locate_test.ts`.
**Produces:** `locateQuoteInSegments(segments, quote): number | null` (pure); `locateQuotes(supabase, meetingIds, quotes)` keeps its signature, calls the pure function.
- [ ] Tests: exact substring hit; ≥4 shared long words hit; <4 → null.
- [ ] Move code, import in chat-transcripts, `npm run test:unit`, commit.

### Task 3: widen `get-shared-meeting`
**Files:** Modify `supabase/functions/get-shared-meeting/index.ts`.
- [ ] Select `follow_ups, timeline_entries, facts` from `meeting_insights`; return `insights.follow_ups`, `insights.timeline_entries`, top-level `facts: publicFacts(insights?.facts)`, `viewer_can_ask: Boolean(share.include_transcript && transcript?.length)`.
- [ ] Commit.

### Task 4: `ask-shared-meeting`
**Files:** Create `supabase/functions/ask-shared-meeting/index.ts`; Modify `supabase/config.toml`, `supabase/functions/_shared/audit.ts` (add `"share.asked"`).
- [ ] Auth via `authenticate()`; service → 403. Body `{token, question, history}`. Resolve share as in get-shared-meeting (`scope='link'`, live, `include_transcript` else 403). `publicSegments` → `[m:ss] Speaker: text` lines. Rate limit `ask-share:${userId}` LLM. gpt-4o-mini JSON `{answer, quote}`; `locateQuoteInSegments` → `citation_seconds`. Meter via `newCostMeter(meetingId)` + `meterOpenAI` + `saveCosts`. Audit `share.asked`. Response `{answer, citation_seconds}`.
- [ ] Commit.

### Task 5: frontend `bucketFacts` + `Ts`/jump context
**Files:** Create `src/components/share/notes.ts` (pure), `src/components/share/jump.tsx`; Test `supabase/functions/tests/share_notes_test.ts`; Modify `src/components/share/types.ts`.
**Produces:** `bucketFacts(facts): TopicSection[]` (`{topic, ts, notes, items: [{kind: 'number'|'pain'|'ask'|'decision', text, ts}]}`); `JumpProvider`, `useJump()` → `{ jump(seconds), seekSeconds, seekNonce, scrollTo, scrollNonce, canJump }`; `<Ts seconds />`.
- [ ] Tests: facts before first topic go to first; boundaries inclusive-left; sorted by ts inside a topic.
- [ ] Types: add `follow_ups`, `timeline_entries`, `facts`, `viewer_can_ask` to `SharedPayload`.
- [ ] Commit.

### Task 6: panels
**Files:** Create `src/components/share/NotesPanel.tsx`, `src/components/share/AskPanel.tsx`; Modify `SummaryPanel.tsx`, `ActionItemsPanel.tsx`, `TranscriptPanel.tsx`, `SharedMeeting.tsx`.
- [ ] SummaryPanel: lead → NotesPanel (fallback prose card when no facts) → decisions with Ts → Next steps → "Read full summary" details → Key points → AskPanel (when `viewer_can_ask`).
- [ ] Action items: `<Ts seconds={item.source_timestamp} />`.
- [ ] Transcript: turn timestamp → `<Ts>`; watch `scrollTo/scrollNonce`, scroll nearest turn into view and flash `bg-eb-accent-soft`.
- [ ] SharedMeeting: wrap in `JumpProvider`, pass seek to `RecordingPlayer`, `document.title`.
- [ ] AskPanel: `useAuth()`; signed-out → `rememberPostLoginRedirect(location.pathname)` + link `/auth`; signed-in → `supabase.functions.invoke('ask-shared-meeting')`.
- [ ] `tsc -p tsconfig.app.json --noEmit`, `npm run build`, `npm run brand:check`; commit.

### Task 7: docs, verify, deploy functions
- [ ] `docs/edge-functions.md` (`get-shared-meeting` payload, new `ask-shared-meeting`), `docs/security.md`, `src/pages/Docs.tsx` share section, CLAUDE.md share paragraph.
- [ ] `npm run test:unit`, `npm run test:rls`, `python3 scripts/pipeline-test/harness.py`.
- [ ] `supabase functions deploy get-shared-meeting ask-shared-meeting`.
- [ ] `npm run dev` → user reviews `/share/<token>` on localhost:8080 before the frontend ships.
