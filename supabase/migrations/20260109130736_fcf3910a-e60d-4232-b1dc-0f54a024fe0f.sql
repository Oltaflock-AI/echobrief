-- Remove SELECT policy from user_oauth_tokens table
-- OAuth tokens must NEVER be readable by end users - only via service role
-- Service role bypasses RLS, so tokens remain accessible server-side

-- Drop the SELECT policy that allows authenticated users to read tokens
DROP POLICY IF EXISTS "Users can view their own OAuth tokens" ON public.user_oauth_tokens;

-- Drop additional policies added in recent migration that also allowed user access
DROP POLICY IF EXISTS "Users can insert their own OAuth tokens" ON public.user_oauth_tokens;
DROP POLICY IF EXISTS "Users can update their own OAuth tokens" ON public.user_oauth_tokens;
DROP POLICY IF EXISTS "Users can delete their own OAuth tokens" ON public.user_oauth_tokens;

-- RLS stays enabled - with NO policies, only service role can access
-- This is the correct security posture for OAuth tokens

-- Update the table comment to document the security model
COMMENT ON TABLE public.user_oauth_tokens IS 'Stores Google OAuth tokens. RLS enabled with NO user policies - accessible ONLY via service role (edge functions). This ensures tokens never leak to client-side code.';