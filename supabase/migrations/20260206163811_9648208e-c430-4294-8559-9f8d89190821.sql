
-- Add RLS policies to user_oauth_tokens (CRITICAL: currently exposed)
CREATE POLICY "Users can view their own oauth tokens"
ON public.user_oauth_tokens
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own oauth tokens"
ON public.user_oauth_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own oauth tokens"
ON public.user_oauth_tokens
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own oauth tokens"
ON public.user_oauth_tokens
FOR DELETE
USING (auth.uid() = user_id);

-- Add RLS policies to notion_connections (also missing policies)
CREATE POLICY "Users can view their own notion connections"
ON public.notion_connections
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notion connections"
ON public.notion_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notion connections"
ON public.notion_connections
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notion connections"
ON public.notion_connections
FOR DELETE
USING (auth.uid() = user_id);
