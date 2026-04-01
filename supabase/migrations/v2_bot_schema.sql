-- EchoBrief v2 — Bot-based recording schema changes
-- Run this against the echobrief Supabase project (qjhysesjocanowmdkeme)

-- 1. Add recording_source to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_source TEXT DEFAULT 'extension' CHECK (recording_source IN ('extension', 'bot'));
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';

-- 2. Bot jobs table — tracks each bot container lifecycle
CREATE TABLE IF NOT EXISTS bot_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  meeting_url TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('google_meet', 'zoom', 'teams')),
  display_name TEXT DEFAULT 'EchoBrief Notetaker',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'joining', 'recording', 'processing', 'completed', 'failed', 'cancelled')),
  container_id TEXT,
  dispatch_reason TEXT CHECK (dispatch_reason IN ('calendar', 'manual', 'slack', 'api', 'extension')),
  preferred_language TEXT DEFAULT 'en',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for bot_jobs
ALTER TABLE bot_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bot jobs" ON bot_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bot jobs" ON bot_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bot jobs" ON bot_jobs FOR UPDATE USING (auth.uid() = user_id);

-- 3. WhatsApp messages table — delivery tracking
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  template_name TEXT,
  language TEXT DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  provider TEXT DEFAULT 'gupshup' CHECK (provider IN ('gupshup', 'twilio')),
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for whatsapp_messages
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own whatsapp messages" ON whatsapp_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own whatsapp messages" ON whatsapp_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Notification preferences — per-user delivery channel settings
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  delivery_channels JSONB DEFAULT '["dashboard"]'::jsonb,
  preferred_language TEXT DEFAULT 'en',
  summary_detail_level TEXT DEFAULT 'standard' CHECK (summary_detail_level IN ('brief', 'standard', 'detailed')),
  whatsapp_number TEXT,
  whatsapp_verified BOOLEAN DEFAULT FALSE,
  slack_channel_id TEXT,
  email_enabled BOOLEAN DEFAULT TRUE,
  auto_record BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for notification_preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own preferences" ON notification_preferences FOR ALL USING (auth.uid() = user_id);

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_bot_jobs_user_id ON bot_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_jobs_status ON bot_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bot_jobs_meeting_url ON bot_jobs(meeting_url);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_meeting ON whatsapp_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user ON whatsapp_messages(user_id);

-- 6. Update meetings table to support bot metadata
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS bot_job_id UUID REFERENCES bot_jobs(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS platform TEXT CHECK (platform IN ('google_meet', 'zoom', 'teams', 'unknown'));
