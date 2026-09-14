-- ClickUp Chat delivery.
--
-- The company moved its day-to-day from Slack to ClickUp, so the "summary to
-- the team room" delivery gets a second destination. The shape is the Slack
-- one (20260908090000_slack_connections.sql) on purpose — the three failures
-- that schema exists to prevent (a shared global token, a pasted channel id, a
-- Disconnect that never wrote to the database) apply just as much here.
--
-- Two ClickUp-specific facts shape the columns:
--   * A ClickUp OAuth token never expires and there is no refresh token, so
--     `refresh_token` and `token_expiry` are present only so
--     `_shared/oauth-tokens.ts` seal/open apply unchanged; they stay null.
--   * One OAuth grant can cover SEVERAL workspaces (the user ticks them on the
--     consent screen). Chat channels are workspace-scoped in the v3 API, so the
--     chosen channel carries its workspace id alongside.

CREATE TABLE IF NOT EXISTS public.clickup_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Sealed (AES-256-GCM via _shared/oauth-tokens.ts). refresh_token and
  -- token_expiry are always null for ClickUp; see the header comment.
  access_token    text,
  refresh_token   text,
  token_expiry    timestamptz,
  scopes          text,

  -- The ClickUp user who granted access, for the UI's "connected as".
  authed_user_id  text,
  authed_email    text,

  -- The workspaces the grant covers, as `[{id, name}]`, refreshed on every
  -- (re)connect. The picker lists channels across all of them.
  workspaces      jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- The destination. Null until the user picks one; a connection with no
  -- channel posts nothing.
  workspace_id    text,
  workspace_name  text,
  channel_id      text,
  channel_name    text,

  needs_reconnect boolean NOT NULL DEFAULT false,
  last_posted_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clickup_connections_user_key
  ON public.clickup_connections (user_id);

ALTER TABLE public.clickup_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY clickup_connections_select_own ON public.clickup_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Claim-before-send ledger, same as slack_deliveries: `afterInsightsSaved`
-- runs on regeneration and on replayed Sarvam callbacks, and a duplicate post
-- in a channel is visible to everyone in it.
CREATE TABLE IF NOT EXISTS public.clickup_deliveries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id  text NOT NULL,
  -- ClickUp's message id. Null until the post succeeds, so a claimed-but-
  -- failed row is distinguishable from a sent one.
  message_id  text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clickup_deliveries_once
  ON public.clickup_deliveries (meeting_id, channel_id);

ALTER TABLE public.clickup_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY clickup_deliveries_select_own ON public.clickup_deliveries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.clickup_connections IS
  'One ClickUp OAuth grant per user. Tokens are AES-256-GCM sealed by _shared/oauth-tokens.ts; ClickUp tokens never expire.';
COMMENT ON TABLE public.clickup_deliveries IS
  'Claim-before-send ledger: one summary per meeting per ClickUp Chat channel, even when insights are regenerated.';
