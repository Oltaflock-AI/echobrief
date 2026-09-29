# Share links play only the guest window

**Date:** 2026-09-29
**Status:** approved design, not built

## Problem

The bot records from the moment it joins. Khush and Vineet usually talk before
the guest arrives and after they leave. A share link hides that chatter from
the transcript, because it serves only `zone = 'meeting'` segments. It does not
hide it from the recording: the link plays Recall's full mp4.

Detection is also weaker than it should be. `computeBoundaries` estimates the
window from when an *invited external attendee first speaks*. In 9 of the last
25 completed meetings it produced no window at all:

- Bots started by hand (Travelux, Lisa, Matthew, Mister Veg) have no attendee
  list, so nobody counts as external. The meeting is marked `internal_only` and
  nothing is trimmed.
- Calendar invites that list only @oltaflock.ai addresses (Traventurs) have the
  same result.

## The signal we were not using

Recall already records exact join and leave times for every participant. They
come from `recordings[0].media_shortcuts.participant_events.data.participant_events_download_url`,
which returns `[{action: "join"|"leave"|…, participant: {name, is_host, …}, timestamp: {relative}}]`.
The bot itself is not in the list. The existing comment in `zones.ts` says no
join or leave events exist on our path. That is wrong.

Measured 2026-09-29 (seconds into the recording):

| Meeting | Events | Speech estimate today |
|---|---|---|
| YDSM, 28 Sep | Vineet join 0 · Khush join 266 · Mathew join 559 · Mathew leave 1479 | 523–1492 |
| Travelux | Vineet, Khush, Grant join 0 · Grant leave 3940 · Khush/Vineet leave 4192 | none (`internal_only`) |
| Lisa | Lisa, Khush, Vineet join 0 · Lisa leave 2995 · Khush/Vineet leave ~3057 | none |
| Matthew | Khush, Vineet, Deepak, Neeraj join 0 · Deepak/Neeraj drop 1184 and rejoin · Mathew join 2760 · last guest leave 4891 · Khush/Vineet leave 5152 | none |

These are the same participant names Recall uses in its transcript. Events are
available for bots whose media is still inside Recall's 7-day retention.

## Rule

- **Internal** means one of these, matched by name with the existing
  `speakerMatchesAttendee` token logic, so `"Khush Mutha (Guest)"` still
  matches:
  - the meeting owner's `profiles.full_name`
  - the `full_name` of every member of the owner's workspace (`org_members`)
  - calendar attendees whose email domain equals the owner's domain (their
    `displayName` and email local part)
- **External** means any participant in the join/leave events who is not
  internal.
- The **window** runs from the first external `join` to the last external
  `leave`. A guest who drops and rejoins does not split the window. A guest
  still present when the recording ends closes the window at the recording's
  end.
- No external participant, or no events, means no window from this source, and
  the existing chain runs unchanged.

## Design

### 1. Participant events (`_shared/recall-pipeline.ts`)

- `fetchParticipantEvents(botData)` downloads the events file and keeps only
  `join` and `leave` rows as `{ action, name, ts }`. It returns `[]` on any
  failure and never throws.
- `ensureParticipantEvents(supabase, meeting)` returns
  `processing_config.recall_participant_events` if it is present. Otherwise,
  when `recall_bot_id` exists, it fetches the events and merges them into
  `processing_config`. It never overwrites the rest of `processing_config`.
- Called from `sarvam-webhook` (where the speaker timeline is already
  re-fetched), `process-meeting` and `regenerate-insights`, then passed into
  `runPostTranscription` as `input.participantEvents`. A regeneration of a
  recent meeting therefore gains the window without a separate migration step.

### 2. Boundaries from presence (`_shared/zones.ts`)

- `Boundaries.source` gains `"presence"`. The frontend mirror in
  `src/types/meeting.ts` is updated too.
- A new pure function
  `boundariesFromPresence(events, internalNames, attendees, recordingSeconds): Boundaries | null`
  applies the rule above and returns null when it cannot decide.
- `internalNamesFor(supabase, meeting)` reads the owner's profile and workspace
  members. On a read error it returns `[]`. With an empty internal list every
  participant looks external, so the window opens at the first join, which is
  0: nothing is cut, and that is the safe failure.
- Order in `post-transcription.ts`: presence, then `computeBoundaries` (speech
  estimate), then the LLM fallback.
- `guardBoundaries` still applies to the two *estimated* sources and **skips
  `presence`**, which is an observed event. Example: YDSM on 14 Sep had
  20 minutes of pre-chatter, and a real long pre-roll must not be "corrected"
  back to the full recording.
- Every consumer of `boundaries` (zones, insights, email, MCP, share
  transcript) picks the window up with no further change.

### 3. Share payload (`get-shared-meeting` + `_shared/share-view.ts`)

- `window = { start, end }` is derived from `meetings.boundaries` when
  `internal_only` is false and both timestamps are set. Otherwise it is null.
- When `window` is set, every timestamp the page receives is shifted by
  `-start`, so the shared meeting runs from 0:00:
  - transcript `start`
  - `facts.*.ts`
  - `action_items[].source_timestamp`
  - `timeline_entries`
  - `follow_ups` times
- `shiftTimestamps(payload, offset)` in `share-view.ts` is pure and
  unit-tested. It handles numeric seconds and `"[h:]mm:ss"` strings, clamps at
  0, and leaves unparseable values alone.
- `meeting.duration_seconds` becomes `end - start`.
- The `resource=recording` response adds the unshifted `window` so the player
  can map display time to media time.
- `ask-shared-meeting` applies the same shift to the second it cites.

### 4. Share-page player (`RecordingPlayer`)

- New optional prop `window?: { start: number; end: number }`, passed only by
  `SharedMeeting`. The owner's page, workspace shares and observer views are
  unchanged and keep the full recording.
- With a window:
  - The browser's native `controls` are replaced by a small custom bar: play
    and pause, a scrubber over `0 … end-start`, elapsed and total time,
    playback speed, and fullscreen.
  - `media.currentTime = display + start`, and `onTime` reports
    `media.currentTime - start`.
  - On load the player seeks to `start`. On `timeupdate` at or past `end` it
    pauses and holds at `end`. Every seek is clamped to `[start, end]`.
- The same applies to the R2 audio fallback after day 7, because it shares the
  recording's timeline.
- Pure mapping and clamping helpers are unit-tested.

### 5. Share dialog (`ShareLinkDialog`)

When the recording toggle is on, the dialog shows one line:

- with a window: "Guest joined 9:19 · left 24:39 — the link plays only that part."
- without one: "No guest detected — the whole recording will be shared."

The existing warning stays, reworded to say what is true: the player is limited
to that span, but the file behind it still holds the full call.

## Out of scope

- A real cut file (ffmpeg to R2). This is option 2 and would make the file
  itself chatter-free.
- Changing what the owner sees on their own meeting page.
- Detection for meetings whose Recall media has already expired. They keep
  their current boundaries.

## Failure modes

| Case | Result |
|---|---|
| Events download fails or is empty | Falls through to today's chain |
| Teammate joins under an unmatched name | They count as external, the window opens at their join (usually 0), and less is trimmed. Safe. |
| Guest's display name matches a teammate | The guest counts as internal, so that guest is missed. Unlikely. If they are the only guest, there is no window and today's chain runs. |
| Profile or org read fails | Every participant looks external, the window opens at the first join (0), and nothing is cut |
| Window set but the transcript has older zones | Cannot happen: zones and window both come from the same `boundaries` write |

## Testing

- `tests/zones_test.ts`: `boundariesFromPresence` against the four real event
  sets above as fixtures, plus the no-events, all-internal and
  guest-still-present-at-end cases. Each assertion also has a negative control
  (an internal-only event set must not produce a window).
- `tests/share_view_test.ts`: `shiftTimestamps` with numbers, `mm:ss`,
  `h:mm:ss`, clamping and unparseable values.
- Player mapping and clamp helpers: unit tests.
- `npm run test:unit`, `npm run test:rls` (the share payload changed),
  `python3 scripts/pipeline-test/harness.py`, `python3 scripts/evals/run_evals.py`
  (boundary exclusion), `npm run build`, and `tsc --noEmit` against a stash
  baseline.
- Manual check: regenerate YDSM 28 Sep, create a share link with the recording,
  open it logged out, and confirm it starts at Mathew's join, stops at his
  leave, and the transcript opens at 0:00.

## Backfill

`scripts/backfill_presence_boundaries.py --days 7` calls `regenerate-insights`
for completed meetings whose bot media is still inside retention. That call
fetches the events, recomputes the zones, and rebuilds insights from the
meeting-zone transcript. It is capped and fails fast on
`credit_balance_exhausted`, because evals and regeneration share the prod
OpenAI key.

## Docs to update

- `CLAUDE.md` (the zones paragraph and the sharing paragraph)
- `docs/pipeline.md`
- `src/pages/Docs.tsx` (the sharing section)
- the `zones.ts` header comment, which currently says there are no join or
  leave events
