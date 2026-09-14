# ClickUp Chat delivery — design (2026-09-14)

## Goal
Post each completed meeting's summary into a ClickUp Chat channel the user picks,
exactly as the Slack integration does. The company moved from Slack to ClickUp,
so this is a second destination for the same "summary to the team room" content.

## Decisions
- Destination is a **ClickUp Chat channel** (API v3), not a task in a List.
- **Full per-user OAuth** (approach A). A pasted personal token was rejected —
  it is what the first Slack integration was removed for.
- No abstraction over Slack: the two clients differ (workspace-scoped v3 paths,
  markdown vs Block Kit, HTTP status vs `ok:false`). The pure text helpers the
  two message builders share move into `_shared/summary-content.ts` so wording
  rules cannot drift between them.

## Verified against ClickUp docs (2026-09-14)
- Authorize: `https://app.clickup.com/api?client_id&redirect_uri&state`.
- Token: `POST https://api.clickup.com/api/v2/oauth/token` with `client_id`,
  `client_secret`, `code` → `{ access_token }`. **Tokens do not expire**; there is
  no refresh token and no revoke endpoint.
- Header: `Authorization: Bearer <token>`.
- Workspaces the user authorised: `GET /api/v2/team` → `{ teams: [{id, name}] }`.
- Channels: `GET /api/v3/workspaces/{id}/chat/channels?limit=100&cursor=` →
  `{ data: [{id, name, type: CHANNEL|DM|GROUP_DM, visibility: PUBLIC|PRIVATE}], next_cursor }`.
- Post: `POST /api/v3/workspaces/{id}/chat/channels/{channel}/messages` with
  `{ type: "message", content, content_format: "text/md" }` → 201 `{ id }`.
  404 when the channel is gone.

## Schema (`20260914120000_clickup_connections.sql`)
- `clickup_connections` — one row per user (unique `user_id`). Sealed
  `access_token` (`refresh_token` always null), `scopes`, `authed_user_id`,
  `workspace_id`, `workspace_name`, `channel_id`, `channel_name`,
  `needs_reconnect`, `last_posted_at`. SELECT-own RLS; writes service-role only.
- `clickup_deliveries` — claim ledger unique on `(meeting_id, channel_id)`,
  `message_id`, `error`. Same shape as `slack_deliveries`.
- Both cascade from `auth.users`, so `delete-account` needs no change.

## Edge functions
- `clickup-oauth-start` (`verify_jwt = true`): 503 when `CLICKUP_CLIENT_ID` is
  unset, writes a `google_oauth_states` row, returns the authorize URL.
- `clickup-oauth-redirect` (`verify_jwt = false`): burns the state, exchanges
  the code, lists authorised workspaces, seals the token, upserts. Clears the
  saved channel when the authorised workspace set no longer contains the one
  it belonged to. Returns to Settings with `?clickup_connected=1`.
- `manage-clickup` (`verify_jwt = true`, user only): `status`, `channels`,
  `set_channel`, `disconnect`. `channels` lists `type = CHANNEL` channels across
  every authorised workspace as `{id, name, is_private, workspace_id,
  workspace_name}`. `set_channel` re-lists and matches the id. `disconnect`
  deletes the row (ClickUp has no revoke; the docs tell the user how to remove
  the app in ClickUp).

## Delivery
`_shared/clickup.ts` (client, `ClickUpError` carrying HTTP status + ECODE,
`listWorkspaces`, `listChannels`, `postMessage`, `buildSummaryMessage`) and
`_shared/clickup-delivery.ts` (`deliverToClickUp`: never throws, claim before
post, `[harness]` skip, 401 → `needs_reconnect`, 404 → clear channel). Hooked
in `afterInsightsSaved` right after Slack.

## Message
Markdown. Title, date/duration/speakers line, summary, one highlight, decisions,
action items (both shapes, "…and N more"), next steps, link to the report.
Meeting-zone fields only — never transcript, coaching, facts or attendee emails.

## UI / docs / config
- ClickUp row under Delivery in `IntegrationsPanel`, `BrandTile brand="clickup"`
  (`public/brands/clickup.png`). Picker groups channels by workspace when more
  than one is authorised.
- `Docs.tsx` section, `docs/edge-functions.md`, CLAUDE.md, `config.toml`,
  secrets `CLICKUP_CLIENT_ID` / `CLICKUP_CLIENT_SECRET`.
- RLS harness seeds both new tables.

## Tests
`clickup_test.ts` (builder, pagination, error mapping), `clickup_delivery_test.ts`
(no connection, no channel, harness skip, 23505 → already_posted, 401 →
needs_reconnect, 404 → channel cleared, success). `npm run test:unit`,
`npm run test:rls` after the migration, `npm run build`, `npm run brand:check`.

## Live verification
Connect the real workspace from Settings, pick a channel, then post one message
through the deployed path. Open risk until then: whether ClickUp echoes `state`
on the redirect (docs say it is accepted, not that it is returned).
