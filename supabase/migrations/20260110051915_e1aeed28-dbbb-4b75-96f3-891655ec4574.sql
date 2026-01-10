-- Add new columns for decision-grade insights
ALTER TABLE public.meeting_insights
ADD COLUMN IF NOT EXISTS strategic_insights jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS open_questions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS speaker_highlights jsonb DEFAULT '[]'::jsonb;