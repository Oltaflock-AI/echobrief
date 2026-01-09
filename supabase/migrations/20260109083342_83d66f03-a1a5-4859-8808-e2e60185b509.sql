-- Fix critical: user_oauth_tokens needs RLS policies (currently service-role only access is correct, but we need explicit policies)
-- The table should only be accessible by service role, not by regular users
-- We'll add a policy that denies all access to regular users (service role bypasses RLS)

-- First ensure RLS is enabled (it should be from previous migration)
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Add explicit deny-all policy for regular users (service role bypasses this)
-- This is already the default behavior when RLS is enabled with no policies, 
-- but adding an explicit comment policy for documentation
COMMENT ON TABLE public.user_oauth_tokens IS 'OAuth tokens - accessible only via service role (RLS enabled, no user policies intentionally)';

-- Fix missing UPDATE/DELETE policies for transcripts
CREATE POLICY "Users can update their own meeting transcripts"
ON public.transcripts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = transcripts.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own meeting transcripts"
ON public.transcripts
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = transcripts.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

-- Fix missing UPDATE/DELETE policies for meeting_insights
CREATE POLICY "Users can update their own meeting insights"
ON public.meeting_insights
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = meeting_insights.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own meeting insights"
ON public.meeting_insights
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = meeting_insights.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

-- Fix missing UPDATE/DELETE policies for slack_messages
CREATE POLICY "Users can update their own slack messages"
ON public.slack_messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = slack_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own slack messages"
ON public.slack_messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = slack_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

-- Fix missing UPDATE policy for google_oauth_states
CREATE POLICY "Users can update their own oauth states"
ON public.google_oauth_states
FOR UPDATE
USING (auth.uid() = user_id);

-- Fix missing DELETE policy for profiles
CREATE POLICY "Users can delete their own profile"
ON public.profiles
FOR DELETE
USING (auth.uid() = user_id);