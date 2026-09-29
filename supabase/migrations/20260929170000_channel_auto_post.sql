-- Choose which meeting summaries reach a Slack / ClickUp channel.
--
-- `auto_post = true` (the default, and what every existing connection keeps)
-- is the behaviour since each integration shipped: `afterInsightsSaved` posts
-- every completed meeting. `false` means "only when I choose" — the pipeline
-- skips the channel, and the owner posts a meeting from its page, through the
-- `post` action on manage-slack / manage-clickup. Both paths go through the
-- same delivery function and the same claim row, so a manual post is still
-- one post per meeting per channel.
ALTER TABLE public.slack_connections
  ADD COLUMN IF NOT EXISTS auto_post boolean NOT NULL DEFAULT true;

ALTER TABLE public.clickup_connections
  ADD COLUMN IF NOT EXISTS auto_post boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.slack_connections.auto_post IS
  'true = post every completed meeting; false = post only meetings the owner sends from the meeting page.';
COMMENT ON COLUMN public.clickup_connections.auto_post IS
  'true = post every completed meeting; false = post only meetings the owner sends from the meeting page.';
