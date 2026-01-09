-- Create a secure table for OAuth tokens (only accessible by service role)
CREATE TABLE public.user_oauth_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  google_access_token text,
  google_refresh_token text,
  google_token_expiry timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS but with NO client-side policies (service role only)
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- No RLS policies = only service role can access this table
-- This is intentional - tokens should never be accessible from client-side

-- Add updated_at trigger
CREATE TRIGGER update_user_oauth_tokens_updated_at
BEFORE UPDATE ON public.user_oauth_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing tokens from profiles to new table
INSERT INTO public.user_oauth_tokens (user_id, google_access_token, google_refresh_token, google_token_expiry)
SELECT user_id, google_access_token, google_refresh_token, google_token_expiry
FROM public.profiles
WHERE google_access_token IS NOT NULL OR google_refresh_token IS NOT NULL;

-- Remove sensitive token columns from profiles table
ALTER TABLE public.profiles 
  DROP COLUMN IF EXISTS google_access_token,
  DROP COLUMN IF EXISTS google_refresh_token,
  DROP COLUMN IF EXISTS google_token_expiry;