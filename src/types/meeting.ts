export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  source: 'google_meet' | 'zoom' | 'teams' | 'manual' | 'calendar';
  calendar_event_id?: string;
  meeting_link?: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  status: 'scheduled' | 'recording' | 'processing' | 'completed' | 'failed';
  audio_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Transcript {
  id: string;
  meeting_id: string;
  content: string;
  speakers: Speaker[];
  word_timestamps: WordTimestamp[];
  created_at: string;
}

export interface Speaker {
  id: string;
  name: string;
  segments: number[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  speaker_id?: string;
}

export interface StrategicInsight {
  insight: string;
  category: 'market' | 'risk' | 'opportunity' | 'process';
}

export interface SpeakerHighlight {
  speaker: string;
  highlight: string;
  context: string;
}

export interface ActionItem {
  task: string;
  owner?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high';
  confidence?: 'low' | 'medium' | 'high';
  outcome?: string;
}

export interface FollowUp {
  description: string;
  assignee?: string;
  deadline?: string;
  type?: 'meeting' | 'research' | 'validation';
}

export interface MeetingInsights {
  id: string;
  meeting_id: string;
  summary_short: string;
  summary_detailed: string;
  key_points: string[];
  action_items: ActionItem[];
  decisions: string[];
  risks: string[];
  follow_ups: FollowUp[];
  strategic_insights: StrategicInsight[];
  speaker_highlights: SpeakerHighlight[];
  open_questions: string[];
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  google_calendar_connected: boolean;
  slack_connected: boolean;
  slack_channel_id?: string;
  slack_channel_name?: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingWithDetails extends Meeting {
  transcript?: Transcript;
  insights?: MeetingInsights;
}
