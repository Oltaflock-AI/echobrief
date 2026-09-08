/**
 * Shapes the settings panels share.
 *
 * Settings.tsx used to declare these inline alongside 1,200 lines of forms and
 * handlers. They live here now so each panel can be read on its own.
 */
export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  google_calendar_connected: boolean;
  google_needs_reconnect: boolean | null;
  email_summaries_enabled: boolean | null;
  custom_vocabulary: string[] | null;
  webhook_url: string | null;
  webhook_secret: string | null;
}

export interface WebhookEvent {
  id: string;
  event_type: string;
  status_code: number | null;
  error: string | null;
  delivered_at: string | null;
  created_at: string;
  meeting_id: string | null;
}

export interface GoogleCalendar {
  id: string;
  email: string;
  name: string;
  is_primary: boolean;
  connected_at: string;
}

