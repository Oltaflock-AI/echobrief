-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  google_calendar_connected BOOLEAN DEFAULT FALSE,
  slack_connected BOOLEAN DEFAULT FALSE,
  slack_channel_id TEXT,
  slack_channel_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create meetings table
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source TEXT DEFAULT 'manual', -- 'google_meet', 'zoom', 'teams', 'manual', 'calendar'
  calendar_event_id TEXT,
  meeting_link TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_time TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'recording', 'processing', 'completed', 'failed'
  audio_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create transcripts table
CREATE TABLE public.transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  speakers JSONB DEFAULT '[]',
  word_timestamps JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create meeting_insights table
CREATE TABLE public.meeting_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  summary_short TEXT,
  summary_detailed TEXT,
  key_points JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  decisions JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  follow_ups JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create slack_messages table to track sent messages
CREATE TABLE public.slack_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  message_ts TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_messages ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Meetings policies
CREATE POLICY "Users can view their own meetings"
  ON public.meetings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own meetings"
  ON public.meetings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meetings"
  ON public.meetings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meetings"
  ON public.meetings FOR DELETE
  USING (auth.uid() = user_id);

-- Transcripts policies (access through meeting ownership)
CREATE POLICY "Users can view transcripts of their meetings"
  ON public.transcripts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = transcripts.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert transcripts for their meetings"
  ON public.transcripts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = transcripts.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

-- Meeting insights policies
CREATE POLICY "Users can view insights of their meetings"
  ON public.meeting_insights FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = meeting_insights.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert insights for their meetings"
  ON public.meeting_insights FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = meeting_insights.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

-- Slack messages policies
CREATE POLICY "Users can view slack messages of their meetings"
  ON public.slack_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = slack_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert slack messages for their meetings"
  ON public.slack_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = slack_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for auto profile creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('recordings', 'recordings', false);

-- Storage policies for recordings bucket
CREATE POLICY "Users can upload their own recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own recordings"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);