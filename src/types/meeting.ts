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
  /**
   * Full pipeline state machine, as written by the edge functions:
   * scheduled -> joining -> in_call -> recording -> processing ->
   * (transcribing, Whisper-fallback path) -> completed, with failed and
   * cancelled as the terminal error states (see recall-webhook,
   * check-recall-status, sarvam-webhook, process-meeting).
   */
  status:
    | 'scheduled'
    | 'joining'
    | 'in_call'
    | 'recording'
    | 'processing'
    | 'transcribing'
    | 'completed'
    | 'failed'
    | 'cancelled';
  audio_url?: string;
  /** Recall.ai bot id, set once a bot was dispatched for this meeting. */
  recall_bot_id?: string | null;
  /** Human-readable failure reason written by the pipeline on failed/cancelled. */
  error_message?: string | null;
  language?: string;
  /** Duration-weighted language mix, e.g. { en: 0.88, hi: 0.12 }. */
  languages?: Record<string, number> | null;
  boundaries?: MeetingBoundaries | null;
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
  source_timestamp?: number;
  /** Deterministically resolved from due_date + the meeting date (IST). */
  due_date_resolved?: string;
  due_date_range?: { start: string; end: string };
  done?: boolean;
}

export interface FollowUp {
  description: string;
  assignee?: string;
  deadline?: string;
  type?: 'meeting' | 'research' | 'validation';
}

export interface TimelineEntry {
  timestamp: number;
  type: 'topic' | 'question' | 'decision' | 'action' | 'risk';
  content: string;
  speaker?: string;
}

export interface SpeakerStat {
  speaker: string;
  /** Share of total speech (speakers sum to 100), NOT of wall-clock. */
  percentage: number;
  seconds?: number;
  /** Legacy key from rows written when GPT estimated these numbers. */
  duration_seconds?: number;
  turns?: number;
  questions?: number;
  words?: number;
  words_per_minute?: number | null;
}

/**
 * Mirrors ConversationMetrics from supabase/functions/_shared/metrics.ts, plus
 * sentiment_score, which is still a model judgment. Every field is optional
 * because rows written before the computed pipeline lack them.
 */
export interface MeetingMetrics {
  sentiment_score?: number;
  speaker_participation?: SpeakerStat[];
  total_speaking_seconds?: number;
  silence_percentage?: number;
  turn_count?: number;
  total_words?: number;
  words_per_minute?: number | null;
  lead_in_silence_seconds?: number;
  trailing_silence_seconds?: number;
  longest_monologue_seconds?: number;
  longest_monologue_speaker?: string | null;
  participation_balance?: number | null;
  questions_asked?: number;
  turns_per_minute?: number | null;
  dominant_speaker?: string | null;
  dominant_speaker_share?: number | null;
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
  timeline_entries?: TimelineEntry[];
  meeting_metrics?: MeetingMetrics;
  facts?: MeetingFacts | null;
  coaching?: CoachingReport | null;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  google_calendar_connected: boolean;
  /** True when the stored Google refresh token stopped working — the user must reconnect. */
  google_needs_reconnect?: boolean | null;
  auto_join_enabled?: boolean;
  notetaker_name?: string;
  pre_meeting_notification_minutes?: number;
  created_at: string;
  updated_at: string;
}

export interface MeetingWithDetails extends Meeting {
  transcript?: Transcript;
  insights?: MeetingInsights;
}

/** One extracted, verbatim-grounded fact rows (facts pipeline, 2026-08-31). */
export interface FactNumber {
  metric: string;
  value: string;
  speaker?: string | null;
  quote?: string;
  ts?: number;
}

export interface FactStatement {
  statement: string;
  speaker?: string | null;
  quote?: string;
  ts?: number;
  addressed?: boolean;
  how_addressed_ts?: number | null;
}

export interface FactCommitment {
  who?: string | null;
  what: string;
  due?: string | null;
  quote?: string;
  ts?: number;
}

/** Mirrors MeetingFacts from supabase/functions/_shared/facts.ts. */
export interface MeetingFacts {
  meeting_type?: string;
  topics?: { topic: string; ts?: number; notes?: string }[];
  numbers?: FactNumber[];
  entities?: { type?: string; name: string; context?: string; ts?: number }[];
  pain_points?: FactStatement[];
  objections?: FactStatement[];
  buying_signals?: FactStatement[];
  explicit_asks?: FactStatement[];
  commitments?: FactCommitment[];
  decisions?: { decision: string; owner?: string | null; ts?: number }[];
  risks?: { statement: string; ts?: number }[];
  open_questions?: string[];
  notable_quotes?: { speaker: string; quote: string; ts?: number; why?: string }[];
  validation?: { unverified: string[]; grounding_rate: number };
}

/** Mirrors CoachingReport from supabase/functions/_shared/coaching.ts. */
export interface CoachingVerdict {
  value: number;
  target: number;
  verdict: 'good' | 'ok' | 'high' | 'low';
  note: string;
}

export interface CoachingFlag {
  value: boolean;
  note: string;
  evidence_ts?: number | null;
  strength?: 'date_locked' | 'vague' | 'none';
}

export interface CoachingReport {
  rep?: string | null;
  external_participant?: string | null;
  metrics?: Record<string, CoachingVerdict>;
  flags?: Record<string, CoachingFlag>;
  sentiment_timeline?: { t: number; score: number; note?: string }[];
  summary?: string;
}

/** Speech-estimated privacy-trim window (meetings.boundaries). */
export interface MeetingBoundaries {
  first_external_join_ts: number | null;
  last_external_leave_ts: number | null;
  source: 'speech_estimated' | 'llm_estimated' | 'none';
  internal_only: boolean;
}

/** Rolling per-contact brief written by the account-brief edge function (contacts.account_brief). */
export interface AccountBrief {
  where_it_stands: string;
  open_commitments_ours: string[];
  open_commitments_theirs: string[];
  unresolved_objections: string[];
  key_numbers: string[];
  next_call_prep: string[];
  meetings_considered: number;
  generated_at: string;
}

/** An external attendee rolled up across the user's meetings (contacts table). */
export interface Contact {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  company: string | null;
  domain: string | null;
  meeting_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  account_brief: AccountBrief | null;
  account_brief_at: string | null;
}

/**
 * A `meetings` row from PostgREST, read as our domain type.
 *
 * Every jsonb column generates as `Json`, and TypeScript refuses to compare
 * `Json` against a declared shape when it sits inside a larger object, so the
 * assertion has to pass through `unknown`. That assertion is a real assumption
 * — that `boundaries`, `attendees`, `languages` and `processing_config` hold
 * what the pipeline writes — and it belongs in one reviewed place rather than
 * at each of the six reads that need it.
 */
export const asMeeting = (row: unknown): Meeting => row as Meeting;
export const asMeetings = (rows: unknown[]): Meeting[] => rows as Meeting[];

/** A `contacts` row, read as our domain type. See {@link asMeeting}. */
export const asContacts = (rows: unknown[]): Contact[] => rows as Contact[];
