-- Add Recall integration columns to profiles table
ALTER TABLE profiles ADD COLUMN auto_join_meetings BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN recording_preference VARCHAR(20) DEFAULT 'audio_video'; -- audio_only or audio_video

-- Create meetings table for Recall recordings
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_event_id VARCHAR(255),
  recall_bot_id VARCHAR(255) UNIQUE,
  meeting_link TEXT NOT NULL,
  platform VARCHAR(50), -- zoom, teams, google_meet
  title TEXT,
  description TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration_seconds INTEGER,
  transcript TEXT,
  summary TEXT,
  action_items JSONB,
  participants JSONB,
  recording_url TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, recording, processing, completed, failed
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for fast queries
CREATE INDEX idx_meetings_user_id ON meetings(user_id);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_recall_bot_id ON meetings(recall_bot_id);

-- Enable RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only see their own meetings
CREATE POLICY "Users can view their own meetings" ON meetings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meetings" ON meetings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meetings" ON meetings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meetings" ON meetings
  FOR DELETE USING (auth.uid() = user_id);
