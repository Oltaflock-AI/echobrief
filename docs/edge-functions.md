# Edge Function Reference

All Supabase Edge Functions run on Deno at
`https://<project>.supabase.co/functions/v1/<name>`.

`verify_jwt` is declared per function in [`supabase/config.toml`](../supabase/config.toml).
**Since the 2026-08-31 auth audit, `verify_jwt = true` is the default** — the gateway
verifies the JWT signature, then `_shared/auth.ts` `authenticate()` reads the `role`
claim to distinguish user tokens from service-role bearers. **Nine** functions keep
`verify_jwt = false`, each for a stated reason: the three signature-verified webhooks
(`recall-webhook`, `sarvam-webhook`, `dodo-webhook`), the four browser redirects that
authenticate via a single-use `state` row (`google-oauth-redirect`,
`microsoft-oauth-redirect`, `slack-oauth-redirect`, `zoho-oauth-redirect`),
`get-shared-meeting` (public by design — the share token *is* the credential), and
`get-google-client-id` (serves only the public client ID).
That list is worth regenerating rather than trusting:

```bash
awk '/^\[functions\./{f=$0} /verify_jwt *= *false/{print f}' supabase/config.toml
```

See [Security § function auth](security.md#edge-function-authentication).

**All 53 deployed functions are documented here.** If you add one, add it here too —
`ls supabase/functions` against this file is the check.

- [Pipeline](#pipeline)
- [Recording control](#recording-control)
- [Upload ingest](#upload-ingest)
- [Workspaces](#workspaces)
- [Billing](#billing)
- [Intelligence](#intelligence)
- [Calendar and OAuth](#calendar-and-oauth)
- [Delivery](#delivery)
- [Account](#account)
- [Operations](#operations)
- [Outside Supabase](#outside-supabase)

---

## Pipeline

### `recall-webhook`
**Trigger:** Recall.ai HTTP callback · **Auth:** signature verified against raw body

Receives every bot lifecycle and media event. Maps status codes to meeting status,
classifies terminal sub-codes into `cancelled` vs `failed`, and on `audio_mixed.done`
hands off to the shared Recall pipeline (transcript fetch → speaker timeline → audio
download → splitter → Sarvam).

`bot.done` race-safety: when `sarvam_job_id` is not yet written, the handler queries
Recall's `/audio_mixed/` endpoint directly. Only `failed` / `missing` mark the meeting
failed — `done`, `processing`, and `unknown` defer to the audio_mixed handler.

---

### `sarvam-webhook`
**Trigger:** Sarvam job-completion callback · **Auth:** callback `auth_token` set at job creation

The longest function in the codebase (554 lines) and the pipeline's real centre of gravity.

1. Skips meetings already `completed` (idempotency), then takes an **atomic
   in-flight claim** on `meetings.sarvam_webhook_claimed_at` for terminal
   callbacks. Sarvam re-fires the same callback every ~8 s while this handler is
   working (it answers only after download → stitch → GPT → email), and the
   status check alone cannot stop those: every retry reads the row before any of
   them writes `completed`. Claims older than 10 min are re-claimable.
2. For chunked jobs, downloads outputs `0.json … N.json` in numeric order and stitches
   them with `i × chunk_seconds` offsets, then time-sorts.
3. On empty output or any download error, falls back to chunk-wise Whisper via the
   splitter. Whole-file Whisper is used only for short meetings; long recordings
   never take that hop.
4. Maps speakers per segment against Recall's timeline, retrying the timeline fetch
   once if it is missing.
5. Runs the post-transcription passes — language mix, leaked-Devanagari translation,
   entity correction, privacy boundary zones (see
   [pipeline.md](pipeline.md#post-transcription-passes-2026-08-31)) — then two-pass
   insights, conversation metrics and the coaching report on the **meeting zone only**,
   saves (`transcripts`, `meeting_insights` incl. `facts`/`coaching`, `meetings.languages`
   / `boundaries`), and delivers. Expect ~60–90 s more per callback than before; the
   in-flight claim absorbs Sarvam's retries meanwhile.

---

### `process-meeting`
**Trigger:** invoked by other functions · **Auth:** service-role bearer only (`verify_jwt = true` + `authenticate()`; user tokens get 403 — users regenerate via `regenerate-insights`)

Orchestrates transcription and insight generation directly. Accepts `forceWhisper`
and transcript-reuse flags. The Sarvam path here is **async webhook-based**, so this
function cannot be used for a synchronous insight regeneration. Runs the same
post-transcription passes as `sarvam-webhook` (the transcript row is updated in place
with the translated/corrected/zoned segments).

> ⚠️ In-edge Whisper OOMs above ~15 MB of audio. See `whisper:oom` in
> [`errors.md`](../errors.md).

---

### `check-recall-status`
**Trigger:** polled by the frontend while a meeting is in flight · **Auth:** user JWT (read scoped to own meetings) or service-role bearer (`verify_jwt = true`)

Syncs live bot status from Recall into the DB, and recovers meetings whose Sarvam
callback was lost. Claims the recovery with an atomic
`sarvam_webhook_triggered_at IS NULL` update — a dedicated column, **not** the
`status` field, so the webhook's `transcribing` skip-guard cannot deadlock it.

---

### `regenerate-insights`
**Trigger:** meeting page "Regenerate" or `scripts/regenerate_insights.py` · **Auth:** user JWT (scoped) or service-role bearer (`verify_jwt = true`, role read in `_shared/auth.ts`)

Rebuilds a completed meeting's insights from the stored transcript through the shared
post-transcription sequence — no re-transcription. Re-runs translation and entity
correction from `original_text` where present, keeps `processing_config.speaker_overrides`,
replaces the `meeting_insights` row (insert-only `saveInsights` means delete first),
updates `transcripts` in place, and fires `meeting.insights_regenerated`. ~60–100 s.

### `rename-speaker`
**Trigger:** inline rename on the transcript · **Auth:** as above

`{ meeting_id, from, to }`. Renames a speaker across transcript segments, action-item
owners, decision owner tags, highlights, timeline, metrics, facts, coaching and the
stored Recall timeline, and records `speaker_overrides` so regeneration preserves it.

### `create-followup-event`
**Trigger:** "Add … to calendar" on an action item with a resolved due date · **Auth:** user JWT only

`{ meeting_id, date, action_index?, invite_attendees?, duration_minutes? }`. Creates a
Google Calendar event on the resolved date at the original meeting's IST time of day
(30 min default) via `_shared/google-token.ts` (refreshes the stored token). Attendees
are invited **only** when `invite_attendees` is true — this is outward-facing mail.
Stores `calendar_event_link` on the action item. Needs the `calendar.events` scope:
`google-oauth-start` requests it since 2026-08-31 and the callback records the granted
scopes on `user_oauth_tokens.google_scopes`; a read-only grant (or Google's 403) returns
`{ code: "NEEDS_RECONNECT" }` and the UI sends the user to Settings to reconnect.

### `draft-followup-email`
**Trigger:** "Draft follow-up" on the meeting page · **Auth:** user JWT or service role

Writes a 120–180-word follow-up from the facts object only (their explicit asks in
their words, top pain point, commitments both ways, follow-up time). Cached on
`meeting_insights.followup_draft`; `force: true` redrafts.

### `account-brief`
**Trigger:** Contacts page · **Auth:** user JWT or service role

`{ contact_id, force? }`. The two-minute pre-call read for a contact, written from the
facts of up to 8 most recent meetings with them. Cached on `contacts.account_brief`.

---

## Recording control

### `start-recall-recording`
**Trigger:** dashboard · **Auth:** user JWT (`verify_jwt = true`); identity comes from the token — a service-role bearer may name a `user_id` in the body, a user token's body `user_id` is ignored

Rejects `meeting_url`s that are not http(s) links on a Zoom / Google Meet / Microsoft
Teams host (400, `_shared/validation.ts`), and returns **429** when the user already
has 3 meetings in `joining`/`in_call`/`recording` — bots cost real money.

Creates a Recall bot with `recallai_streaming` real-time transcription enabled,
requests both `audio_mixed_mp3` (transcription) and `video_mixed_mp4` (playback), and
inserts the `meetings` row at `status = joining`. Retention is pinned to
`{ type: "timed", hours: 168 }` — Recall stores media free for 7 days and bills past
it, and nothing needs the recording that long. The recording_config must stay in sync
with `auto-join-meetings`.

### `get-org-transcript`
**Trigger:** meeting page, Transcript tab, for a colleague · **Auth:** caller JWT (`verify_jwt = true`, user tokens only)

Returns `{ segments, text, zone_filtered: true }` for a meeting shared to the caller's
workspace — the **meeting-zone** segments only, whitelisted to `speaker` / `text` /
`start` by the same `_shared/share-view.ts` a public share link goes through.

It exists because `transcripts` has no org RLS policy and must not get one: RLS cannot
filter elements inside a JSONB array, so a policy would hand a colleague the internal
pre/post-meeting zones wholesale. Access is decided by `_shared/org-access.ts` (live
org share, `include_transcript` set); anything else is a 404, including a meeting the
caller can see by some *other* route such as an observer grant — that route has its own
read path. Owners and observers never reach here; their direct PostgREST read already
returns everything. Every call writes a `transcript.queried` audit row.

### `get-recording-media`
**Trigger:** meeting page, Recording tab · **Auth:** caller JWT (`verify_jwt = true`)

Resolves a short-lived playback URL for one meeting and returns
`{ kind: "video" | "audio" | "none", url?, video_status? }`. Video comes from Recall's
`video_mixed` artifact (signed by Recall, expires in hours — resolved per view, never
persisted); if there is no video it signs the archived mp3 in the `recordings` bucket
instead. A playback URL is minted only for the meeting's owner, an allowlisted
reviewer holding a `meeting_observers` grant on it (see `meeting_observers` in
[`database.md`](database.md)), or a colleague whose workspace the meeting is shared
to with `include_recording` (resolved by `_shared/org-access.ts`); anyone else gets a
404, not a 403.

The resolution itself lives in `_shared/recording-media.ts`, because
`get-shared-meeting` serves the same media to anonymous readers of a share link that
carries the recording. Only the authorisation differs between the two call sites.

> Bots pin retention to 240 h (`RECORDING_RETENTION_HOURS`), so the mp4 is playable for
> **10 days**. Recall's free window is 7 days; the other 72 hours are billed at
> $0.000069 per hour of media per hour stored — about $0.005 per recording-hour.
> Retention is fixed at bot-creation time: neither PATCH endpoint can extend a recording
> afterwards (`/recording/{id}/` returns 200 and ignores the field, `/bot/{id}/` refuses
> with "Only scheduled bots can be updated").
>
> The mp4 is never downloaded into Supabase Storage — 720p costs ~750 MB–1 GB per
> hour against a 1 GB bucket cap. See `storage:bucket_full_blocks_pipeline` in
> [`errors.md`](../errors.md) for what a full bucket does to the pipeline.

### `manage-meeting-share`
**Trigger:** meeting page, Share dialog · **Auth:** user JWT (`verify_jwt = true`)

**A meeting gets at most one live link from here on** (migration 20260909150000),
enforced here rather than by a unique index: an index would have required revoking the
existing backlog to be creatable, and links already in somebody's inbox must keep
working. This function is the only writer — `meeting_shares` has no INSERT policy — so
the rule holds. `create` returns the existing live link with the requested settings
applied (`reused: true`) or mints a new `ebs_live_` token; `rotate` revokes **that one
link** and mints a replacement — the answer to "that link went further than I meant" and
the only way to get a displayable URL for a pre-20260909150000 link. Older live links are
untouched and are listed in the dialog with their own revoke. `list` returns the caller's links for that meeting **with their URLs**, `update`
changes what a link carries and when it expires without invalidating it, `revoke` stamps
`revoked_at`, and `share_to_org` / `unshare_from_org` add or remove the `scope='org'` row
for the caller's workspace. Ownership is established from the JWT and never from the
body. `meeting_shares` has no INSERT policy — only this function (service role) can write
a valid token hash.

The token is stored twice: a sha256 digest (`token_hash`, what `get-shared-meeting`
matches on) and an AES-256-GCM sealed copy (`token_sealed`, opened only here so the owner
can see their own link again). Sealing is a deliberate weakening over hash-only storage —
a database dump plus `TOKEN_ENCRYPTION_KEY` yields live links — taken because a link
nobody can look up is a link people replace by minting another. Rows created before
20260909150000 have no sealed copy: they keep resolving, but their URL cannot be shown
again and the dialog says so rather than pretending.

`create`, `rotate` and `update` take `include_transcript` and `include_recording`. Both
columns default to `false` server-side, so an omitted flag narrows a link rather than
widening it, and no link minted before 2026-09-02 gained reach when the columns were
added — but the dialog now sends both **on** by default, because a link carrying neither
is a summary an attachment could have carried.

### `get-shared-meeting`
**Trigger:** the public `/share/:token` page · **Auth:** none (`verify_jwt = false`) — the
token in the URL is the entire credential; rate-limited per IP (`RATE_LIMITS.PUBLIC`)

Returns the meeting title/time, the summary, decisions and action items. Two things
are served only when the share row asks for them:

| Opt-in | What is served | What still cannot leak |
|---|---|---|
| `include_transcript` | `zone = 'meeting'` segments, via `_shared/share-view.ts` | pre/post zones, `original_text`, any field not whitelisted |
| `include_recording` | `?resource=recording` → `_shared/recording-media.ts` | — the mp4 is the **whole call**, waiting-room audio included |

That asymmetry is the point: a transcript can be trimmed to the meeting zone segment by
segment, and a recording cannot be trimmed at all. The recording is therefore a separate
switch, defaulting off, warned about where it is turned on. Requesting the recording on a
link that does not carry it is a 403, not a redirect to the summary.

Nothing else is reachable through this endpoint at any setting: no attendee emails, no
coaching, no facts, and nothing about the owner's other meetings. Expired, revoked and
never-existed links share one 404 message, so the endpoint is not an oracle for whether
a link was ever real. A meeting whose content retention has passed says so plainly
rather than rendering an empty page.

### `auto-join-meetings`
**Trigger:** pg_cron, every 5 min · **Auth:** service-role bearer only (`verify_jwt = true`; the cron job sends the Vault-sourced key — see [Operations § scheduled jobs](operations.md#scheduled-jobs))

For every profile with `auto_join_enabled`, dispatches a bot to calendar events
starting within 7 minutes. Per-event dedup guard plus a unique index prevent duplicate
bots across overlapping polls.

---

## Upload ingest

Recording is bot-only for meetings a bot can join. Upload ingest covers the rest — a
phone call, an in-person conversation, a file someone sent you.

**The file never touches Supabase Storage, and never passes through our API.** The
project caps one object at 50 MiB (~55 minutes at 128 kbps) against a 1 GB bucket, so
the recordings most worth transcribing are exactly the ones Storage refuses; and a
serverless function's request body is capped at a few megabytes, so a long recording
could not be POSTed to one either. The browser uploads straight to a **private Vercel
Blob**, and `split-audio` reads it with the store token — the same shape as the existing
path where the splitter pulls from Recall's own URL when Storage rejected the file.

```
browser ──file──► Vercel Blob (private)
   │                   ▲
   └─ POST /api/upload ─┘ (token only, never the bytes)
          │
          ├─ prepare-upload   (user JWT) → plan gate + meeting row
          └─ ingest-upload    (service)  → split-audio → Sarvam → sarvam-webhook
                                              └─ blob deleted
```

Everything downstream of the Sarvam callback is identical to a bot meeting — an uploaded
meeting should be indistinguishable from a recorded one once it has a transcript.

### `prepare-upload`
**Trigger:** `api/upload.ts`, before a blob token exists · **Auth:** `verify_jwt = true`, **user JWT only** (403 for a service bearer — an upload belongs to the person who made it)

`POST { filename, content_type, size_bytes }` → `{ meeting_id, plan, max_meeting_seconds, max_bytes, allowed_content_types }`.

**This is the entitlement gate**, and it is why the endpoint exists at all. Every path
that spends transcription money calls `checkRecordingAllowed` first; an upload path that
skipped it would be a way around the plan, since a free account could hand us unlimited
audio simply by not using a bot. It runs *before* the token is issued, because once the
client can upload, the transfer is already committed.

| Refusal | Status |
|---|---|
| No active subscription / over the plan's allowance | **402** with `code`, `plan`, `usage` |
| Content type not in the allowlist | **415** |
| Over the 2 GB transfer ceiling | **413** |

The meeting row is created here, before the bytes exist, with status `uploading` — so an
authorised upload is visible, and so `ingest-upload` has something to attach the job to.
`meeting_started` is ledgered immediately, as on the bot path; the seconds are ledgered
later, once the pipeline knows the real duration.

### `ingest-upload`
**Trigger:** `api/upload.ts` `onUploadCompleted` · **Auth:** `verify_jwt = true`, **service only** (the caller is our own Vercel function; the user was authenticated when the token was issued)

`POST { meeting_id, blob_url }` → `{ ok, job_id, chunk_count, duration_seconds }`. Hands
the blob to `split-audio` with `audioSource: "blob"`, then saves `sarvam_job_id`, the
chunk metadata and `duration_seconds`. Idempotent: a meeting that already has a
`sarvam_job_id` returns `{ skipped: true, reason: "already_submitted" }`, because Vercel
Blob can retry its completion callback and two jobs on one meeting means two callbacks
racing to overwrite each other's transcript.

**There is deliberately no whole-file fallback**, unlike the Recall path. That fallback
exists because a bot meeting has already happened and a degraded transcript beats none.
An upload has not been consumed: failing loudly leaves the user a file to re-upload,
whereas a whole-file submission of long audio returns an *empty* transcript from
saaras:v3 and silently burns their quota.

### `api/upload.ts` (Vercel)
Issues the client-upload token and hears the result; the bytes never pass through it.
The Supabase access token arrives in `clientPayload` and is **not trusted** — it is
forwarded as a bearer to `prepare-upload`, whose gateway verifies the signature, so a
forged payload gets a 401 rather than an upload token. On success the blob is deleted:
its only job was to reach the splitter, and an archive we do not need is an archive that
can leak. On failure it is kept, because it is the only copy and a retry needs it.

An abandoned upload (tab closed, connection lost) leaves a row in `uploading` forever.
The monitor resolves it to **`cancelled`** — neutral, nothing captured, nothing spent —
on a **six-hour** clock rather than the usual fifteen minutes, because nothing touches
the row while the browser is sending bytes. See
[`errors.md`](../errors.md) → `stuck:uploading:never_arrived`.

---

## Workspaces

One organisation per user (a unique index on `org_members.user_id`), which is what
makes pooled quota unambiguous. **Joining a workspace shares nothing** — meetings stay
private until an explicit `meeting_shares` row exists.

### `manage-organization`
**Trigger:** Settings → workspace · **Auth:** `verify_jwt = true`, **user JWT only** (a service bearer gets 403 — every action here is "what may *this person* do")

`POST { action }`, defaulting to `get`:

| Action | Who | Effect |
|---|---|---|
| `create` | anyone not already in a workspace (409 if they are) | Creates the org, caller becomes `owner` |
| `get` | any member | The org, the caller's role, members and pending invites. Returns `{ organization: null }` rather than an error when the caller has no workspace |
| `invite` | admins only (403) | Emails an invite; 409 past `MAX_MEMBERS` or on a duplicate pending invite, 502 if the mail fails |
| `revoke_invite` | admins only | Withdraws a pending invite |
| `remove_member` | admins only | Removes someone from the workspace |
| `leave` | any member | The caller leaves |

Every membership question in the underlying RLS goes through a `SECURITY DEFINER`
helper (`my_org_id`, `is_org_admin`) — a policy on `org_members` that selects from
`org_members` is infinite recursion, and Postgres only reports it at query time.

### `accept-org-invite`
**Trigger:** the invite link · **Auth:** `verify_jwt = true`, **user JWT only** (403 otherwise — an invite is accepted by a signed-in person, not a service)

`POST { token }`. An unknown token is 404, and so is one already used or expired —
deliberately the same answer, so the endpoint cannot be used to probe which invite
tokens exist. On success: `{ joined: true, organization, role }`.

---

## Billing

### `manage-billing`
**Trigger:** Settings → Billing · **Auth:** `verify_jwt = true`, caller's JWT (401 without one, or on an invalid session)

`POST { action }`:

| Action | Effect |
|---|---|
| `plan` | `{ plan }` from `planForProfile()` — the resolved entitlement, not what was paid for |
| `checkout` | Opens a Dodo subscription checkout for a **plan** (`starter` \| `pro`) on a **period** (`monthly` \| `annual`). 400 on an unknown plan or period, 400 if a subscription is already active, 503 when the pair resolves to no product |
| `portal` | Dodo customer portal link; 400 before the user has a billing profile |

**The client names a plan, never a product.** `productForPlan` resolves the pair
server-side from the same `DODO_PLAN_PRODUCTS` / `DODO_PLAN_PRODUCTS_ANNUAL` maps that
`planForProfile` reads in reverse, so what a customer pays for and what they are
entitled to cannot drift.

---

## Intelligence

### `chat-transcripts`
**Trigger:** the `/chat` page · **Auth:** `verify_jwt = true`, caller's JWT used for retrieval

Question-answering over the caller's own meeting transcripts. Uses the **caller's
token rather than the service-role key** so Postgres RLS — not an application-level
`user_id` filter — does the scoping. Full design rationale in
[Chat & analytics](chat-and-analytics.md).

**Request**
```json
{ "question": "What did we decide about pricing?",
  "history": [{ "role": "user", "content": "..." }] }
```

**Response**
```json
{ "answer": "...",
  "citations": [{ "meeting_id": "...", "title": "...", "date": "2026-08-20" }],
  "context_meetings": 12, "context_tokens": 41230, "truncated": false }
```

### `generate-digest-report`
**Trigger:** parked (not scheduled) · **Auth:** service-role bearer only (`verify_jwt = true` + `authenticate()`)

Builds weekly/monthly aggregate digests across a user's meetings. Parked — not
deployed; hardened to service-only so an accidental deploy exposes nothing.

---

## Calendar and OAuth

All rows are `verify_jwt = true` and require the caller's JWT, except the two noted.
`sync-calendars` takes its identity from the JWT — a body `user_id` is honoured only
for service-role bearers.

| Function | Purpose |
|---|---|
| `google-oauth-start` | Begins the OAuth flow, persists a `google_oauth_states` row |
| `google-oauth-callback` | Exchanges the code, stores tokens in `user_oauth_tokens` |
| `google-oauth-redirect` | Redirect target from Google — no JWT by design (`verify_jwt = false`); the single-use `state` row authenticates it |
| `get-google-client-id` | Serves the public client ID to the frontend (`verify_jwt = false`, nothing secret) |
| `disconnect-google` | Revokes and clears stored Google tokens; clears `google_needs_reconnect` |
| `sync-google-calendar` | Full sync of a single Google calendar |
| `sync-calendars` | Discovers and syncs the user's calendar list |
| `sync-calendar-events` | Event-level sync into `calendar_events` |
| `fetch-google-calendars` | Lists calendars available on the Google account |
| `get-user-calendars` | Reads the user's connected calendars from the DB |
| `microsoft-oauth-start` | Begins the Microsoft/Entra flow. Requires the caller's JWT; 503 when `AZURE_CLIENT_ID` is unset. Returns `{ authUrl, redirectUri }` — delegated Graph scopes `offline_access User.Read Calendars.Read` |
| `microsoft-oauth-redirect` | Redirect target from Microsoft — no JWT by design (`verify_jwt = false`); the single-use `state` row authenticates it. Shares the `google_oauth_states` table, and is rate limited before it touches anything |
| `slack-oauth-start` | Begins the Slack install. Requires the caller's JWT; 503 when `SLACK_CLIENT_ID` is unset. Scopes `chat:write,chat:write.public,channels:read,groups:read` — the read scopes exist so the channel can be **picked** rather than pasted, and `chat:write.public` so a picked *public* channel works without an invite (without it the picker offers destinations that fail with `not_in_channel` on the first meeting). Reuses `google_oauth_states` |
| `slack-oauth-redirect` | Redirect target from Slack — no JWT by design (`verify_jwt = false`); the single-use `state` row authenticates it. Seals the bot token into `slack_connections`, and **clears any saved channel when the workspace changed**, because an id from the old workspace still looks configured while being unpostable |
| `zoho-oauth-start` | Begins the Zoho CRM install. Requires the caller's JWT; 503 when `ZOHO_CLIENT_ID` is unset. Sends `access_type=offline` and `prompt=consent` — **without both, Zoho returns no refresh token** and the connection silently dies an hour later. Read-only scopes plus `ZohoCRM.modules.notes.CREATE` |
| `zoho-oauth-redirect` | Redirect target from Zoho — no JWT by design (`verify_jwt = false`); the single-use `state` row authenticates it. Stores the grant's **`api_domain`** alongside the sealed tokens: Zoho tokens are datacentre-bound and a token from `.in` is rejected by `.com`. Refuses a grant that arrives without a refresh token rather than storing one that stops working |
| `disconnect-calendar` | Provider-neutral disconnect. **Microsoft only** — it returns 400 for anything else and points at `disconnect-google`, which owns the Google revocation path |

A permanently dead grant (Google answers `invalid_grant`, or a refresh yields no
`access_token` in a parseable non-5xx response) sets
`profiles.google_calendar_connected = false` and `google_needs_reconnect = true`
(`_shared/google-token.ts`, `auto-join-meetings`); both OAuth success paths and
`disconnect-google` clear the flag. Transient failures never flip it.

---

## Delivery

| Function | Purpose |
|---|---|
| `manage-zoho` | Zoho CRM actions for the signed-in user: `status`, `test`, `disconnect`. `verify_jwt = true`, user token only. Never returns a token. `test` refreshes the grant and runs a real search, so a dead connection surfaces in Settings rather than silently at the end of somebody's next meeting; `disconnect` deletes the row, then revokes the refresh token at Zoho best-effort |
| `manage-slack` | Slack connection actions for the signed-in user: `status`, `channels`, `set_channel`, `disconnect`. `verify_jwt = true`, user token only (service bearers 403). Never returns a token. `set_channel` re-lists the channels and matches the requested id against that list — the removed 2026-08 integration accepted a pasted id, which made a typo indistinguishable from a working setup until a meeting silently failed to deliver. `disconnect` deletes the row (that row's existence *is* "connected"), then revokes the token in Slack best-effort |
| `send-meeting-email` | The real summary email (HTML). `verify_jwt = true`: service callers keep the full contract — `deliverResults` sends once for the owner, then once per allowlisted reviewer on the invite (`recipientEmail` in the body); a **user token is scoped to its own meetings and the recipient is forced to the owner's profile email**. Claims `email_deliveries` **before** calling Resend, so one recipient gets one summary per meeting no matter how many callers race; returns `{ success: true, skipped: true, reason: "already_sent" }` to a loser. |
| `send-email-report` | Meeting report mail from the meeting page. `verify_jwt = true`; non-service callers only for meetings they own (404 otherwise), `recipient_email` shape-checked, body `user_id` ignored |
| `send-scheduled-emails` | Drains scheduled sends. **Parked/undeployed**; service-role only, cron job unscheduled |
| `queue-onboarding-emails` | Enqueues the onboarding sequence. **Parked/undeployed**; service-role only |

All email goes through **Resend**, from `hello@echobrief.in`.

> `echobrief.in` is the only verified sending domain on the Resend account.
> Any from-address on `oltaflock.ai` returns 403.

Delivery is suppressed for `[harness]`-prefixed meetings unless `HARNESS_EMAILS=true`.

---

## Account

### `delete-account`
**Trigger:** Settings, "Delete account" · **Auth:** user JWT only (`verify_jwt = true`; service-role bearers get 403 — deletion is a decision only the owner's own session can make)

`POST { "confirm": "DELETE" }` (400 without the exact confirmation string). In order:
removes every object under `recordings/<userId>/` in Storage (paginated, batched),
best-effort revokes the Google refresh token at Google (failures ignored), deletes
rows in the user-scoped tables that do **not** cascade from `auth.users`
(`user_oauth_tokens`, `google_oauth_states`, `contacts`, `webhook_events`,
`meeting_notifications`, `billing_events`), then `auth.admin.deleteUser` — the FK
cascades clear profiles, meetings and everything hanging off them. Returns
`{ success: true }`. Irreversible.

---

### `manage-api-tokens`
**Trigger:** Settings → Developer · **Auth:** `verify_jwt = true`, caller's JWT (401 without an `Authorization` header or on an invalid session)

`POST { action }` — `create` \| `list` \| `revoke`, anything else 400:

- `create` — name must be 1–60 characters. **The token is returned exactly once**, in
  the create response; only its sha256 hash and a display prefix are stored, so a lost
  token is reissued, never recovered.
- `list` — id, name, prefix, scopes, created/last-used/revoked/expires. Never the token.
- `revoke` — by `id`; 400 without one.

These are the personal access tokens the [MCP endpoint](mcp.md) authenticates with.

### `redeem-access-code`
**Trigger:** the access-code box at sign-up/Settings · **Auth:** `verify_jwt = true`, **user JWT only** (403 for a service bearer — a code is redeemed *by* a signed-in person, and there is no user to attribute it to otherwise)

`POST { code }`. The grant itself lives in the `redeem_access_code` SQL function rather
than here, so the check-and-claim is one atomic statement and a code cannot be redeemed
twice by two racing callers. Invalid, spent and expired codes all return the same
message — the endpoint is not an oracle for which codes exist.

---

## Operations

### `monitor-stuck-meetings`
**Trigger:** pg_cron, every 15 min · **Auth:** service-role bearer only (`verify_jwt = true`; the cron job sends the Vault-sourced key)

Finds meetings sitting >15 minutes in a non-terminal status, derives a signature,
and acts:

| Outcome | Action |
|---|---|
| Signature in `KNOWN_PATTERNS` | Attempt the canonical recovery (force Whisper / re-trigger Sarvam / check Recall / mark failed) |
| Recovery fails | Email `ALERT_EMAIL_TO` with subject prefix `[ECHOBRIEF]` |
| Signature unknown | Email with prefix `[ECHOBRIEF NEW ERROR]` |
| Meeting is `[harness]`-titled | Prefix `[ECHOBRIEF HARNESS TEST]`, **suppressed** unless `HARNESS_EMAILS=true` |

A `monitor_events` row is written in every case — deduped by a generated `hour_bucket`
column, so one row per meeting + signature + hour. The harness asserts on the row, not
the email.

Known signatures live in
[`known-patterns.ts`](../supabase/functions/monitor-stuck-meetings/known-patterns.ts),
which **mirrors** [`errors.md`](../errors.md). Update both or they drift.

### `prune-content`
**Trigger:** pg_cron, daily 04:15 UTC — **currently `active = false`** · **Auth:** `verify_jwt = true`, **service only** (403 for a user token)

Plan-aware retention, and the counterpart to `prune-recordings`: it groups profiles by
plan and deletes `meeting_insights`, `transcripts` and archived audio past that plan's
`retentionDays`, stamping `meetings.content_pruned_at` so the history row survives and
the UI can explain the gap.

`?dry_run=1` reports exactly what would go without deleting anything. **Use it.** The
job was paused immediately after deploy on 2026-09-01 when a dry run showed 65 meetings
past the 90-day window, 9 of which still held a transcript — deleting real meeting
content is not a decision to make on a cron tick. Re-enable with:

```sql
select cron.alter_job((select jobid from cron.job where jobname='prune-content'),
                      active := true);
```

### `send-feedback-prompts`
**Trigger:** cron, daily · **Auth:** `verify_jwt = true`, **service only** (403 for a user token)

The early-access feedback sequence. It claims a row in `feedback_prompts` **before**
sending, so a racing or replayed caller collides on `23505` and skips rather than
mailing a second copy — the same claim-then-send shape as `send-meeting-email`, and for
the same reason.

### `prune-recordings`
**Trigger:** pg_cron, daily 22:00 UTC (03:30 IST) · **Auth:** service-role bearer only (`verify_jwt = true`; the cron job sends the Vault-sourced key)

Clears `audio_url` and deletes the archived mp3 for meetings older than **30 days**
that already have a non-empty transcript — dropping to **7 days** when the bucket is
near its cap. Rows are kept; only the audio goes.

> This exists because the `recordings` bucket hit the 1 GB free-tier cap on
> 2026-08-20, at which point every new upload failed silently and transcription had
> been dead since 2026-08-14. See `storage:bucket_full_blocks_pipeline` in
> [`errors.md`](../errors.md).

---

## Outside Supabase

### `api/split-audio` (Vercel)
**Trigger:** called by `recall-pipeline` and `sarvam-webhook` · **Auth:** `Authorization: Bearer ${SPLIT_AUDIO_SECRET}`

Runs on Vercel because it needs real ffmpeg and ~2 GB of memory.

**Default mode — Sarvam submission**
```jsonc
// request
{ "audioUrl": "https://…signed", "callbackUrl": "…/sarvam-webhook", "callbackToken": "…" }
// response
{ "job_id": "…", "chunk_count": 6, "chunk_seconds": 300, "duration_seconds": 1740 }
```

**Whisper mode — chunk-wise fallback**
```jsonc
// request
{ "audioUrl": "https://…signed", "transcribe": "whisper" }
// response
{ "transcript": "…", "language_code": "en",
  "segments": [{ "text": "…", "start": 0, "end": 4.2 }],
  "chunk_count": 6, "chunk_seconds": 300, "duration_seconds": 1740 }
```

Constants: 300 s chunks, ≤360 s submitted unchunked, max 20 files per Sarvam job,
upload concurrency 6, 270 s internal time budget against Vercel's 300 s ceiling.

Deployed via **GitHub auto-deploy**. The Vercel account that owns `echobrief.in` is
separate — do **not** use the local Vercel CLI for it.

---

## Changelog

- **2026-08-31** — production auth audit: `verify_jwt = true` became the default
  (see the intro above), the cron-invoked functions went service-role-only with
  pg_cron authenticating from Vault, the parked email functions were locked to the
  service role, `sync-calendars` stopped trusting a body `user_id`, and
  `delete-account` was added.
- **2026-08-31** — removed `send-meeting-summary-email`, `generate-meeting-insights`
  and `fetch-calendar-events` (undeployed alongside this change). All three were
  reachable with **no authentication** and had no remaining callers — the summary
  email goes through `send-meeting-email`, insights through
  `process-meeting`/`regenerate-insights`, and the UI reads calendar events from
  the `calendar_events` table directly. Deleted rather than hardened.
