ALTER TABLE public.google_oauth_states
ADD COLUMN origin TEXT;

CREATE INDEX IF NOT EXISTS idx_google_oauth_states_user_id ON public.google_oauth_states(user_id);