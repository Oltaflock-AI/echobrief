-- Add RLS policies to user_oauth_tokens table to protect sensitive OAuth tokens
-- This table contains Google access/refresh tokens and must be strictly protected

-- Ensure RLS is enabled (should already be, but confirming)
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only view their own OAuth tokens
CREATE POLICY "Users can view their own OAuth tokens"
ON public.user_oauth_tokens
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can only insert their own OAuth tokens
CREATE POLICY "Users can insert their own OAuth tokens"
ON public.user_oauth_tokens
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can only update their own OAuth tokens
CREATE POLICY "Users can update their own OAuth tokens"
ON public.user_oauth_tokens
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can only delete their own OAuth tokens
CREATE POLICY "Users can delete their own OAuth tokens"
ON public.user_oauth_tokens
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add comment documenting security requirements
COMMENT ON TABLE public.user_oauth_tokens IS 'Stores Google OAuth tokens. Access restricted to token owner only via RLS. Service role used for server-side operations.';