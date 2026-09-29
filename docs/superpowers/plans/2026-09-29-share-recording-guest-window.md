# Share Links Play Only the Guest Window: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When someone opens a share link, the transcript and the recording both
start when the guest joined and stop when they left, and the page's clock runs
from 0:00.

**Architecture:** The window comes from Recall's participant join/leave events,
matched against the owner's own team names. `zones.ts` gets a new pure
`boundariesFromPresence` that runs ahead of the speech estimate and writes into
the same `meetings.boundaries`. `get-shared-meeting` subtracts the window start
from every timestamp it returns and tells the player where the window is. The
share-page player uses its own controls, clamped to that window.

**Tech Stack:** Deno edge functions (Supabase), React 18 + TS + Tailwind, deno
test.

**Spec:** `docs/superpowers/specs/2026-09-29-share-recording-guest-window-design.md`

## Global Constraints

- The owner's own meeting page, workspace shares and observer views are
  unchanged and keep the full recording.
- No window (no events, no guest, no known team names) → behaviour is exactly
  today's.
- `presence` windows are never passed through `guardBoundaries`.
- Brand: Console tokens only (`eb-*` Tailwind classes). `npm run brand:check`
  must pass.
- Never log credential material.
- `tsconfig.app.json` is not strict: return flat nullable shapes, not
  discriminated unions.

## Files

| File | Change |
|---|---|
| `supabase/functions/_shared/zones.ts` | `PresenceEvent`, `boundariesFromPresence`, `"presence"` source, guard skip |
| `supabase/functions/_shared/presence.ts` (new) | `parseParticipantEvents`, `fetchParticipantEvents`, `internalNamesFor` |
| `supabase/functions/_shared/post-transcription.ts` | presence first; events returned and persisted via `meetingPatch` |
| `supabase/functions/_shared/share-view.ts` | `shareWindow`, `shiftSegments`, `shiftSharedInsights`, `shiftPublicFacts` |
| `supabase/functions/get-shared-meeting/index.ts` | shifted payload + `window` on the recording response |
| `supabase/functions/ask-shared-meeting/index.ts` | shift segments before prompting and citing |
| `src/lib/playbackWindow.ts` (new) | pure display↔media mapping |
| `src/components/meeting/RecordingPlayer.tsx` | windowed playback with custom controls on share links |
| `src/components/meeting/ShareLinkDialog.tsx` + `src/pages/MeetingDetail.tsx` | window line under the recording switch |
| `src/types/meeting.ts` | `'presence'` source |
| tests | `zones_test.ts`, `presence_test.ts`, `share_view_test.ts`, `playback_window_test.ts` |

---

### Task 1: `boundariesFromPresence` (pure)

**Files:** Modify `supabase/functions/_shared/zones.ts`. Test
`supabase/functions/tests/zones_test.ts`.

**Produces:**
- `export interface PresenceEvent { action: "join" | "leave"; name: string; ts: number }`
- `export function boundariesFromPresence(events: PresenceEvent[] | null | undefined, internalNames: string[], attendees: Attendee[] | null | undefined, recordingSeconds: number): Boundaries | null`
- `Boundaries.source` now includes `"presence"`.

Rules:
- **Internal** means the name matches one of `internalNames`, or matches an
  attendee on the owner's domain, using `speakerMatchesAttendee`.
- If there are no internal identities at all, return null. A failed profile
  read must not turn everyone into a guest.
- If no external participant joins, return null.
- `first` is the earliest external join.
- `end` is the latest external leave if it comes after the latest external
  join. Otherwise the guest was still present at the end, so `end` is
  `recordingSeconds`, or the latest event ts when that is unknown.
- `guardBoundaries` returns `presence` windows untouched.

- [ ] Write tests using the four real event sets from the spec (YDSM → 559/1479,
  Travelux → 0/3940, Lisa → 0/2995, Matthew → 0/4891). Add negative and edge
  cases: all internal → null; no internal names → null; guest still present →
  recording end; guard does not reject a 559–1479 presence window on a
  transcript with most speech outside it.
- [ ] Run `deno test -A supabase/functions/tests/zones_test.ts` and confirm it
  fails.
- [ ] Implement.
- [ ] Run the tests and confirm they pass.
- [ ] Commit.

### Task 2: Presence I/O (`presence.ts`)

**Files:** Create `supabase/functions/_shared/presence.ts`. Test
`supabase/functions/tests/presence_test.ts`.

**Produces:**
- `parseParticipantEvents(raw: unknown): PresenceEvent[]`: keeps join/leave
  rows only and reads `timestamp.relative`.
- `fetchParticipantEvents(botId: string): Promise<PresenceEvent[]>`: runs
  `getRecallBot`, then
  `recordings[0].media_shortcuts.participant_events.data.participant_events_download_url`.
  Returns `[]` on any failure.
- `internalNamesFor(supabase, userId: string): Promise<string[]>`: the owner's
  `full_name` plus the `full_name` of every member of the owner's org. Returns
  `[]` on error.

- [ ] Tests: parse a real-shaped event list (drops `speech_on` and similar
  rows); fetch through mocked `fetch` (bot → download URL → events); missing
  URL → `[]`; download 500 → `[]`.
- [ ] Implement, run the tests, commit.

### Task 3: Pipeline wiring (`post-transcription.ts`)

- Take the events from `processing_config.recall_participant_events` when
  present. Otherwise, when `meeting.recall_bot_id` or
  `processing_config.recall_bot_id` is set, fetch them.
- Run `boundariesFromPresence` first. `computeBoundaries` runs only when it
  returns null, and the LLM fallback condition is unchanged.
- `PostTranscriptionResult.participantEvents`. `meetingPatch` persists
  `recall_participant_events` when the list is non-empty.
- The header comment names the new order.
- [ ] `npm run test:unit` green. Commit.

### Task 4: Shifted share payload

**Files:** `_shared/share-view.ts`, `get-shared-meeting/index.ts`,
`ask-shared-meeting/index.ts`. Test `share_view_test.ts`.

**Produces (share-view.ts):**
- `shareWindow(boundaries: unknown): { start: number; end: number } | null`:
  null for `internal_only`, a null edge, or `end <= start`.
- `shiftSegments(segs: PublicSegment[], offset: number): PublicSegment[]`
- `shiftPublicFacts(f: PublicFacts | null, offset: number): PublicFacts | null`
- `shiftSharedInsights<T>(insights: T, offset: number): T`: shifts
  `action_items[].source_timestamp` and `timeline_entries[].timestamp`.

All of them clamp at 0 and leave non-numbers alone.

get-shared-meeting:
- Select `boundaries`.
- Shift the transcript, facts and insights by `window.start`.
- `duration_seconds = end - start` when a window exists.
- The recording response is `{...media, window}`.

ask-shared-meeting:
- Select `boundaries` and shift the segments before building the prompt, so the
  clock and `citation_seconds` are page time.

- [ ] Tests first, then implement, run, commit.

### Task 5: Windowed share player

**Files:** Create `src/lib/playbackWindow.ts`. Modify `RecordingPlayer.tsx`.
Test `supabase/functions/tests/playback_window_test.ts` (Deno imports `src/lib`,
as `meeting_url_parity_test.ts` already does).

**Produces:**
- `toMediaTime(display, w)` is `clamp(display, 0, len) + w.start`.
- `toDisplayTime(media, w)` is `clamp(media - w.start, 0, len)`.
- `windowLength(w)`

RecordingPlayer:
- When `shareToken` is set and `data.window` exists, render `<video>` or
  `<audio>` without `controls`, plus a controls bar: play/pause, a range input
  over `0..len`, `m:ss / m:ss`, speed (1×/1.25×/1.5×/2×) and fullscreen (video).
- On `loadedmetadata` seek to `start`. On `timeupdate` at or past `end`, pause
  and hold at `end`; before `start`, snap to `start`.
- External seeks (`seekSeconds`) are display time, mapped with `toMediaTime`.
  `onTime` reports display time.

- [ ] Tests for the helpers, then implement, then `npm run build` and
  `tsc --noEmit -p tsconfig.app.json` against the baseline. Commit.

### Task 6: Share dialog line + types

- `MeetingBoundaries.source` gets `'presence'`.
- `ShareLinkDialog` takes a `boundaries?: MeetingBoundaries | null` prop from
  `MeetingDetail`. The recording hint reads either
  - "Plays from when your guest joined (m:ss) to when they left (m:ss). The
    file behind the player is still the full call.", or
  - "No guest detected — the whole call is shared, including anything said
    while the bot was waiting."
- [ ] Build, brand check, commit.

### Task 7: Docs, verify, deploy, backfill

- Update CLAUDE.md (the zones and sharing paragraphs), `docs/pipeline.md`,
  `src/pages/Docs.tsx` (sharing) and the `zones.ts` header.
- Run `npm run test:unit`, `npm run test:rls`,
  `python3 scripts/pipeline-test/harness.py` and
  `python3 scripts/evals/run_evals.py`.
- Deploy `get-shared-meeting`, `ask-shared-meeting`, `sarvam-webhook`,
  `process-meeting` and `regenerate-insights`, then push for Vercel.
- Run `scripts/regenerate_insights.py` for the last 7 days of completed
  meetings.
- Check a real link logged out: YDSM 28 Sep must start at Mathew's join.
