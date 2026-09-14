# Share page: timestamps, notes by topic, "Ask this meeting" — design (2026-09-14)

## Goal
Bring the public share page (`/share/:token`) up to what a Fireflies share
page gives a reader, without copying its dark patterns: every note carries a
timestamp that jumps into the recording or transcript, the notes are grouped
by topic instead of one prose blob, and a signed-in viewer can ask the meeting
a question. Everything is drawn from data the pipeline already stores; no
prompt or migration changes.

Gap audit against a real Fireflies share (2026-09-14): Fireflies has
timestamps on every bullet, topic H2 sections, per-person action items, a
login-gated chat, a forced sign-in modal and leaks pre-meeting chatter. We
copy the first three and the chat; we keep free transcript search and the
zone stripping, and never force a sign-in.

## Decisions
- **No pipeline change.** `facts.topics` (4–10 chapter headings with 1–2
  sentence notes and `ts`), `facts.numbers/pain_points/explicit_asks/decisions`
  (each with `ts`), `timeline_entries`, `follow_ups` and
  `action_items[].source_timestamp` already exist. The share page just never
  rendered them.
- **Highlights, then chapters; prose collapsed.** `summary_short` stays the
  lead. Then **Highlights** — the key points, sentences, each stamped with the
  second a number inside it was said (matched against `facts.numbers`: one
  strong token such as "2500"/"6%", or two weak ones). Then **Chapters** — the
  topics as a time-ordered outline (`m:ss · topic — one-line note`). Raw
  `metric: value` / pain-point / ask rows are **not** rendered: the first cut
  hung them under each chapter and produced "uptime reliability: 2 to 3" as a
  note, which nobody could read. `summary_detailed` moves behind a "Read full
  summary" disclosure. Meetings without facts (pre-2026-08-31) fall back to
  today's prose card.
- **Timestamp click order:** recording on the link → Recording tab + seek;
  else transcript on the link → Transcript tab + scroll/flash that turn; else
  plain text.
- **"Ask this meeting" is login-gated, never forced.** Shown only when the
  link carries the transcript. Signed-out readers see a one-line invitation to
  sign in; the page itself never blocks.
- **Facts go through a whitelist.** New `publicFacts()` in
  `_shared/share-view.ts` next to `publicSegments()`. Verbatim `quote`s,
  `entities`, `objections`, `buying_signals`, `notable_quotes`, `validation`
  and speaker attribution on numbers are dropped by construction.

## Payload (`get-shared-meeting`)
Adds to the `meeting` response, all optional-by-history:
- `insights.follow_ups: string[]`
- `insights.timeline_entries: [{timestamp, type, content, speaker}]`
- `facts: { topics[{topic, ts, notes}], numbers[{metric, value, ts}],
  pain_points[{statement, ts}], explicit_asks[{statement, ts}],
  decisions[{decision, owner, ts}] } | null`
- `viewer_can_ask: boolean` — `include_transcript && transcript.length > 0`.
`action_items[].source_timestamp` already passes through unchanged.

## Share page
- `<Ts seconds>` chip (JetBrains Mono, existing `timestamp()`), click handled
  by a `useJump()` context provided by `SharedMeeting` — owns the active tab,
  `seekSeconds`/`seekNonce` for `RecordingPlayer`, and a `scrollTo` seconds
  value the transcript panel watches.
- **Summary tab:** lead → Highlights (`highlightsOf`) → Chapters
  (`chaptersOf`) → Decisions (`<Ts>` from `facts.decisions` matched by text) →
  Next steps (`follow_ups`) → "Read full summary" → Ask this meeting. Rail
  unchanged, action items gain `<Ts>`.
- **Actions tab:** `<Ts>` per item.
- **Transcript tab:** turn timestamp becomes the `<Ts>` chip; on `scrollTo`
  the nearest turn at-or-before that second scrolls into view and flashes.
- `document.title` = meeting title.

## Ask this meeting
- UI: card at the bottom of the Summary tab when `viewer_can_ask`. Signed-out:
  text + link to `/auth?next=/share/<token>`. `Auth.tsx` honours `next` only
  when it is a same-origin path starting with `/`. Signed-in: question box,
  answer, citation `<Ts>` (same jump behaviour), last 10 turns kept as history.
- Function `ask-shared-meeting` (`verify_jwt = true`, `authenticate()`, user
  JWT only — service callers 403). Body `{token, question, history}`.
  Service role resolves the share exactly as `get-shared-meeting` does (live,
  `scope='link'`, `include_transcript`), loads `publicSegments()` — the same
  whitelist, so the model sees only the meeting zone — and answers from that
  one transcript with the `chat-transcripts` rules. Rate limit `LLM` keyed on
  the viewer's user id. Citation quote → timestamp through `locateQuote`,
  extracted from `chat-transcripts` into `_shared/quote-locate.ts` so both
  functions share one implementation. LLM cost metered against the meeting via
  `_shared/cost.ts`. Audit row `share.asked`.
- Not offered on org shares; colleagues have the real chat.

## Tests
- Unit: `publicFacts` drops quotes/entities/etc.; `chaptersOf` / `highlightsOf`
  number matching; `locateQuote` extraction keeps `chat-transcripts` behaviour.
- `npm run test:rls` — a new function reads share rows.
- `python3 scripts/pipeline-test/harness.py` before deploying either function.
- `tsc --noEmit` against a stash baseline; `npm run build`; `npm run brand:check`.

## Docs to touch
`docs/edge-functions.md`, `docs/security.md` (share surface), `src/pages/Docs.tsx`
share section, CLAUDE.md share paragraph.
