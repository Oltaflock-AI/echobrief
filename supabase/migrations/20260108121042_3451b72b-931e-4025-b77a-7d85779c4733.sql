-- Create table to store OAuth states for secure Google Calendar connection
CREATE TABLE public.google_oauth_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  return_to TEXT NOT NULL DEFAULT '/settings',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;

-- Users can only see their own states
CREATE POLICY "Users can view their own oauth states"
ON public.google_oauth_states
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own states
CREATE POLICY "Users can create their own oauth states"
ON public.google_oauth_states
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own states
CREATE POLICY "Users can delete their own oauth states"
ON public.google_oauth_states
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for fast state lookups
CREATE INDEX idx_google_oauth_states_state ON public.google_oauth_states(state);

-- Auto-cleanup old states (older than 10 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_old_oauth_states()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.google_oauth_states 
  WHERE created_at < now() - interval '10 minutes';
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_oauth_states_trigger
AFTER INSERT ON public.google_oauth_states
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_old_oauth_states();