export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_code_redemptions: {
        Row: {
          access_code_id: string
          granted_until: string
          id: string
          plan: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          access_code_id: string
          granted_until: string
          id?: string
          plan: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          access_code_id?: string
          granted_until?: string
          id?: string
          plan?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_code_redemptions_access_code_id_fkey"
            columns: ["access_code_id"]
            isOneToOne: false
            referencedRelation: "access_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      access_codes: {
        Row: {
          code: string
          created_at: string
          duration_days: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_redemptions: number
          note: string | null
          plan: string
          redemptions: number
        }
        Insert: {
          code: string
          created_at?: string
          duration_days?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number
          note?: string | null
          plan?: string
          redemptions?: number
        }
        Update: {
          code?: string
          created_at?: string
          duration_days?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number
          note?: string | null
          plan?: string
          redemptions?: number
        }
        Relationships: []
      }
      action_item_completions: {
        Row: {
          action_item_index: number
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          meeting_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_item_index: number
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          meeting_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_item_index?: number
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          meeting_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_item_completions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "action_item_completions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_item_completions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      api_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_token_id: string | null
          actor_type: string
          actor_user_id: string | null
          created_at: string
          id: string
          ip: unknown
          metadata: Json | null
          org_id: string | null
          resource_id: string | null
          resource_type: string | null
          result: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_token_id?: string | null
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          metadata?: Json | null
          org_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          result?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_token_id?: string | null
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip?: unknown
          metadata?: Json | null
          org_id?: string | null
          resource_id?: string | null
          resource_type?: string | null
          result?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          event_id: string
          event_type: string
          id: string
          payload: Json
          received_at: string
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          event_id: string
          event_type: string
          id?: string
          payload: Json
          received_at?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          received_at?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bot_jobs: {
        Row: {
          container_id: string | null
          created_at: string | null
          dispatch_reason: string | null
          display_name: string | null
          ended_at: string | null
          error_message: string | null
          id: string
          joined_at: string | null
          meeting_id: string | null
          meeting_url: string
          platform: string
          preferred_language: string | null
          started_at: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          container_id?: string | null
          created_at?: string | null
          dispatch_reason?: string | null
          display_name?: string | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          joined_at?: string | null
          meeting_id?: string | null
          meeting_url: string
          platform: string
          preferred_language?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          container_id?: string | null
          created_at?: string | null
          dispatch_reason?: string | null
          display_name?: string | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          joined_at?: string | null
          meeting_id?: string | null
          meeting_url?: string
          platform?: string
          preferred_language?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_jobs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "bot_jobs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_jobs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          access_token: string | null
          created_at: string
          id: string
          last_synced_at: string | null
          needs_reconnect: boolean
          provider: string
          refresh_token: string | null
          scopes: string | null
          token_expiry: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          needs_reconnect?: boolean
          provider: string
          refresh_token?: string | null
          scopes?: string | null
          token_expiry?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          needs_reconnect?: boolean
          provider?: string
          refresh_token?: string | null
          scopes?: string | null
          token_expiry?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          attendees: Json | null
          calendar_id: string
          created_at: string | null
          description: string | null
          end_time: string | null
          event_id: string
          id: string
          is_recurring: boolean | null
          location: string | null
          meeting_link: string | null
          organizer_email: string | null
          organizer_name: string | null
          provider: string
          raw_data: Json | null
          start_time: string | null
          title: string | null
          updated_at: string | null
          user_id: string
          version: string | null
        }
        Insert: {
          attendees?: Json | null
          calendar_id: string
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          event_id: string
          id?: string
          is_recurring?: boolean | null
          location?: string | null
          meeting_link?: string | null
          organizer_email?: string | null
          organizer_name?: string | null
          provider?: string
          raw_data?: Json | null
          start_time?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
          version?: string | null
        }
        Update: {
          attendees?: Json | null
          calendar_id?: string
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          event_id?: string
          id?: string
          is_recurring?: boolean | null
          location?: string | null
          meeting_link?: string | null
          organizer_email?: string | null
          organizer_name?: string | null
          provider?: string
          raw_data?: Json | null
          start_time?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
          version?: string | null
        }
        Relationships: []
      }
      calendars: {
        Row: {
          calendar_id: string
          calendar_name: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          last_synced_at: string | null
          provider: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calendar_id: string
          calendar_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          last_synced_at?: string | null
          provider: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calendar_id?: string
          calendar_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          last_synced_at?: string | null
          provider?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          citations: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          truncated: boolean
          user_id: string
        }
        Insert: {
          citations?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          truncated?: boolean
          user_id: string
        }
        Update: {
          citations?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          truncated?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_brief: Json | null
          account_brief_at: string | null
          company: string | null
          created_at: string
          domain: string | null
          email: string
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          meeting_count: number
          name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_brief?: Json | null
          account_brief_at?: string | null
          company?: string | null
          created_at?: string
          domain?: string | null
          email: string
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          meeting_count?: number
          name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_brief?: Json | null
          account_brief_at?: string | null
          company?: string | null
          created_at?: string
          domain?: string | null
          email?: string
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          meeting_count?: number
          name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      digest_reports: {
        Row: {
          created_at: string | null
          error_message: string | null
          frequency: string
          id: string
          insights_summary: Json | null
          meetings_count: number | null
          message_ids: string[] | null
          period_end: string
          period_start: string
          recipient_emails: string[] | null
          sent_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          frequency: string
          id?: string
          insights_summary?: Json | null
          meetings_count?: number | null
          message_ids?: string[] | null
          period_end: string
          period_start: string
          recipient_emails?: string[] | null
          sent_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          frequency?: string
          id?: string
          insights_summary?: Json | null
          meetings_count?: number | null
          message_ids?: string[] | null
          period_end?: string
          period_start?: string
          recipient_emails?: string[] | null
          sent_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      digest_schedules: {
        Row: {
          created_at: string | null
          day_of_month: number | null
          day_of_week: number | null
          enabled: boolean | null
          frequency: string
          hour_of_day: number | null
          id: string
          minute_of_hour: number | null
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          enabled?: boolean | null
          frequency: string
          hour_of_day?: number | null
          id?: string
          minute_of_hour?: number | null
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          enabled?: boolean | null
          frequency?: string
          hour_of_day?: number | null
          id?: string
          minute_of_hour?: number | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_deliveries: {
        Row: {
          created_at: string
          id: string
          kind: string
          meeting_id: string
          provider_message_id: string | null
          recipient_email: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          meeting_id: string
          provider_message_id?: string | null
          recipient_email: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          meeting_id?: string
          provider_message_id?: string | null
          recipient_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_deliveries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "email_deliveries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_deliveries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          meeting_id: string
          message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          meeting_id: string
          message_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          meeting_id?: string
          message_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "email_messages_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_prompts: {
        Row: {
          id: string
          kind: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          kind: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      function_errors: {
        Row: {
          context: Json | null
          created_at: string
          function_name: string
          id: string
          meeting_id: string | null
          message: string
          stack: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          function_name: string
          id?: string
          meeting_id?: string | null
          message: string
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          function_name?: string
          id?: string
          meeting_id?: string | null
          message?: string
          stack?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      google_oauth_states: {
        Row: {
          created_at: string
          id: string
          origin: string | null
          return_to: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          origin?: string | null
          return_to?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          origin?: string | null
          return_to?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      instance_io_samples: {
        Row: {
          above_baseline: boolean
          alerted: boolean
          captured_at: string
          counters: Json
          id: string
          rates: Json | null
        }
        Insert: {
          above_baseline?: boolean
          alerted?: boolean
          captured_at?: string
          counters: Json
          id?: string
          rates?: Json | null
        }
        Update: {
          above_baseline?: boolean
          alerted?: boolean
          captured_at?: string
          counters?: Json
          id?: string
          rates?: Json | null
        }
        Relationships: []
      }
      meeting_contacts: {
        Row: {
          contact_id: string
          created_at: string
          meeting_id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          meeting_id: string
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          meeting_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_contacts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "meeting_contacts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_contacts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_costs: {
        Row: {
          llm_calls: number
          llm_models: string[]
          llm_tokens_in: number
          llm_tokens_out: number
          meeting_id: string
          pipeline_runs: number
          recall_seconds: number
          stt_provider: string | null
          stt_seconds: number
          updated_at: string
        }
        Insert: {
          llm_calls?: number
          llm_models?: string[]
          llm_tokens_in?: number
          llm_tokens_out?: number
          meeting_id: string
          pipeline_runs?: number
          recall_seconds?: number
          stt_provider?: string | null
          stt_seconds?: number
          updated_at?: string
        }
        Update: {
          llm_calls?: number
          llm_models?: string[]
          llm_tokens_in?: number
          llm_tokens_out?: number
          meeting_id?: string
          pipeline_runs?: number
          recall_seconds?: number
          stt_provider?: string | null
          stt_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_costs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "meeting_costs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_costs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_insights: {
        Row: {
          action_items: Json | null
          coaching: Json | null
          created_at: string
          decisions: Json | null
          facts: Json | null
          follow_ups: Json | null
          followup_draft: Json | null
          id: string
          key_points: Json | null
          meeting_id: string
          meeting_metrics: Json | null
          open_questions: Json | null
          risks: Json | null
          search_vector: unknown
          speaker_highlights: Json | null
          strategic_insights: Json | null
          summary_detailed: string | null
          summary_short: string | null
          timeline_entries: Json | null
        }
        Insert: {
          action_items?: Json | null
          coaching?: Json | null
          created_at?: string
          decisions?: Json | null
          facts?: Json | null
          follow_ups?: Json | null
          followup_draft?: Json | null
          id?: string
          key_points?: Json | null
          meeting_id: string
          meeting_metrics?: Json | null
          open_questions?: Json | null
          risks?: Json | null
          search_vector?: unknown
          speaker_highlights?: Json | null
          strategic_insights?: Json | null
          summary_detailed?: string | null
          summary_short?: string | null
          timeline_entries?: Json | null
        }
        Update: {
          action_items?: Json | null
          coaching?: Json | null
          created_at?: string
          decisions?: Json | null
          facts?: Json | null
          follow_ups?: Json | null
          followup_draft?: Json | null
          id?: string
          key_points?: Json | null
          meeting_id?: string
          meeting_metrics?: Json | null
          open_questions?: Json | null
          risks?: Json | null
          search_vector?: unknown
          speaker_highlights?: Json | null
          strategic_insights?: Json | null
          summary_detailed?: string | null
          summary_short?: string | null
          timeline_entries?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_insights_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "meeting_insights_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_insights_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_notifications: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          id: string
          meeting_id: string | null
          notification_type: string
          scheduled_for: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          id?: string
          meeting_id?: string | null
          notification_type?: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          id?: string
          meeting_id?: string | null
          notification_type?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_notifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "meeting_notifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_notifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_shares: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          include_recording: boolean
          include_transcript: boolean
          last_viewed_at: string | null
          meeting_id: string
          org_id: string | null
          revoked_at: string | null
          scope: string
          token_hash: string | null
          token_prefix: string | null
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          include_recording?: boolean
          include_transcript?: boolean
          last_viewed_at?: string | null
          meeting_id: string
          org_id?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash?: string | null
          token_prefix?: string | null
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          include_recording?: boolean
          include_transcript?: boolean
          last_viewed_at?: string | null
          meeting_id?: string
          org_id?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash?: string | null
          token_prefix?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "meeting_shares_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "meeting_shares_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_shares_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_shares_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          attendees: Json | null
          audio_url: string | null
          bot_job_id: string | null
          boundaries: Json | null
          calendar_event_id: string | null
          content_pruned_at: string | null
          created_at: string
          duration_seconds: number | null
          end_time: string | null
          error_message: string | null
          id: string
          languages: Json | null
          meeting_link: string | null
          platform: string | null
          preferred_language: string | null
          processing_config: Json | null
          recall_bot_id: string | null
          recording_ended_at: string | null
          recording_source: string | null
          retention_exempt: boolean
          sarvam_job_id: string | null
          sarvam_webhook_claimed_at: string | null
          sarvam_webhook_triggered_at: string | null
          source: string | null
          start_time: string
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          audio_url?: string | null
          bot_job_id?: string | null
          boundaries?: Json | null
          calendar_event_id?: string | null
          content_pruned_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_time?: string | null
          error_message?: string | null
          id?: string
          languages?: Json | null
          meeting_link?: string | null
          platform?: string | null
          preferred_language?: string | null
          processing_config?: Json | null
          recall_bot_id?: string | null
          recording_ended_at?: string | null
          recording_source?: string | null
          retention_exempt?: boolean
          sarvam_job_id?: string | null
          sarvam_webhook_claimed_at?: string | null
          sarvam_webhook_triggered_at?: string | null
          source?: string | null
          start_time?: string
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json | null
          audio_url?: string | null
          bot_job_id?: string | null
          boundaries?: Json | null
          calendar_event_id?: string | null
          content_pruned_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_time?: string | null
          error_message?: string | null
          id?: string
          languages?: Json | null
          meeting_link?: string | null
          platform?: string | null
          preferred_language?: string | null
          processing_config?: Json | null
          recall_bot_id?: string | null
          recording_ended_at?: string | null
          recording_source?: string | null
          retention_exempt?: boolean
          sarvam_job_id?: string | null
          sarvam_webhook_claimed_at?: string | null
          sarvam_webhook_triggered_at?: string | null
          source?: string | null
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_bot_job_id_fkey"
            columns: ["bot_job_id"]
            isOneToOne: false
            referencedRelation: "bot_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_events: {
        Row: {
          created_at: string
          details: Json | null
          email_sent: boolean
          error_signature: string
          hour_bucket: string | null
          id: string
          is_new_pattern: boolean
          meeting_id: string | null
          recovery_attempted: string | null
          recovery_succeeded: boolean | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          email_sent?: boolean
          error_signature: string
          hour_bucket?: string | null
          id?: string
          is_new_pattern?: boolean
          meeting_id?: string | null
          recovery_attempted?: string | null
          recovery_succeeded?: boolean | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          email_sent?: boolean
          error_signature?: string
          hour_bucket?: string | null
          id?: string
          is_new_pattern?: boolean
          meeting_id?: string | null
          recovery_attempted?: string | null
          recovery_succeeded?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "monitor_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "monitor_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          auto_record: boolean | null
          created_at: string | null
          delivery_channels: Json | null
          email_enabled: boolean | null
          id: string
          join_minutes_before: number | null
          notetaker_name: string | null
          preferred_language: string | null
          summary_detail_level: string | null
          updated_at: string | null
          user_id: string
          whatsapp_number: string | null
          whatsapp_verified: boolean | null
        }
        Insert: {
          auto_record?: boolean | null
          created_at?: string | null
          delivery_channels?: Json | null
          email_enabled?: boolean | null
          id?: string
          join_minutes_before?: number | null
          notetaker_name?: string | null
          preferred_language?: string | null
          summary_detail_level?: string | null
          updated_at?: string | null
          user_id: string
          whatsapp_number?: string | null
          whatsapp_verified?: boolean | null
        }
        Update: {
          auto_record?: boolean | null
          created_at?: string | null
          delivery_channels?: Json | null
          email_enabled?: boolean | null
          id?: string
          join_minutes_before?: number | null
          notetaker_name?: string | null
          preferred_language?: string | null
          summary_detail_level?: string | null
          updated_at?: string | null
          user_id?: string
          whatsapp_number?: string | null
          whatsapp_verified?: boolean | null
        }
        Relationships: []
      }
      oauth_clients: {
        Row: {
          client_name: string
          client_secret_hash: string | null
          created_at: string
          id: string
          last_used_at: string | null
          redirect_uris: string[]
          token_endpoint_auth_method: string
        }
        Insert: {
          client_name: string
          client_secret_hash?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          redirect_uris: string[]
          token_endpoint_auth_method?: string
        }
        Update: {
          client_name?: string
          client_secret_hash?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          redirect_uris?: string[]
          token_endpoint_auth_method?: string
        }
        Relationships: []
      }
      oauth_codes: {
        Row: {
          client_id: string
          code_challenge: string
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          redirect_uri: string
          resource: string
          scope: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          redirect_uri: string
          resource: string
          scope: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          redirect_uri?: string
          resource?: string
          scope?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_refresh_tokens: {
        Row: {
          api_token_id: string
          client_id: string
          created_at: string
          expires_at: string
          id: string
          scope: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          api_token_id: string
          client_id: string
          created_at?: string
          expires_at: string
          id?: string
          scope: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          api_token_id?: string
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          scope?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_refresh_tokens_api_token_id_fkey"
            columns: ["api_token_id"]
            isOneToOne: false
            referencedRelation: "api_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_refresh_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          revoked_at: string | null
          role: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          revoked_at?: string | null
          role?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          revoked_at?: string | null
          role?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          joined_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          joined_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auto_join_enabled: boolean | null
          avatar_url: string | null
          bot_color: string | null
          created_at: string
          custom_vocabulary: string[]
          dodo_customer_id: string | null
          dodo_subscription_id: string | null
          email: string | null
          email_summaries_enabled: boolean
          full_name: string | null
          google_calendar_connected: boolean | null
          google_needs_reconnect: boolean
          id: string
          notetaker_name: string | null
          notification_frequency: string | null
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          plan_override: string | null
          plan_override_expires_at: string | null
          pre_meeting_notification_minutes: number | null
          preferred_languages: string[] | null
          subscription_product_id: string | null
          subscription_quantity: number | null
          subscription_renews_at: string | null
          subscription_status: string
          summary_language: string
          ui_v2: boolean
          updated_at: string
          user_id: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          auto_join_enabled?: boolean | null
          avatar_url?: string | null
          bot_color?: string | null
          created_at?: string
          custom_vocabulary?: string[]
          dodo_customer_id?: string | null
          dodo_subscription_id?: string | null
          email?: string | null
          email_summaries_enabled?: boolean
          full_name?: string | null
          google_calendar_connected?: boolean | null
          google_needs_reconnect?: boolean
          id?: string
          notetaker_name?: string | null
          notification_frequency?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          plan_override?: string | null
          plan_override_expires_at?: string | null
          pre_meeting_notification_minutes?: number | null
          preferred_languages?: string[] | null
          subscription_product_id?: string | null
          subscription_quantity?: number | null
          subscription_renews_at?: string | null
          subscription_status?: string
          summary_language?: string
          ui_v2?: boolean
          updated_at?: string
          user_id: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          auto_join_enabled?: boolean | null
          avatar_url?: string | null
          bot_color?: string | null
          created_at?: string
          custom_vocabulary?: string[]
          dodo_customer_id?: string | null
          dodo_subscription_id?: string | null
          email?: string | null
          email_summaries_enabled?: boolean
          full_name?: string | null
          google_calendar_connected?: boolean | null
          google_needs_reconnect?: boolean
          id?: string
          notetaker_name?: string | null
          notification_frequency?: string | null
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          plan_override?: string | null
          plan_override_expires_at?: string | null
          pre_meeting_notification_minutes?: number | null
          preferred_languages?: string[] | null
          subscription_product_id?: string | null
          subscription_quantity?: number | null
          subscription_renews_at?: string | null
          subscription_status?: string
          summary_language?: string
          ui_v2?: boolean
          updated_at?: string
          user_id?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      scheduled_emails: {
        Row: {
          created_at: string | null
          email: string
          id: string
          send_at: string
          sent_at: string | null
          status: string | null
          subject: string
          template: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          send_at: string
          sent_at?: string | null
          status?: string | null
          subject: string
          template: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          send_at?: string
          sent_at?: string | null
          status?: string | null
          subject?: string
          template?: string
          user_id?: string
        }
        Relationships: []
      }
      slack_connections: {
        Row: {
          access_token: string | null
          authed_user_id: string | null
          bot_user_id: string | null
          channel_id: string | null
          channel_name: string | null
          created_at: string
          id: string
          last_posted_at: string | null
          needs_reconnect: boolean
          refresh_token: string | null
          scopes: string | null
          team_id: string
          team_name: string | null
          token_expiry: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          authed_user_id?: string | null
          bot_user_id?: string | null
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string
          id?: string
          last_posted_at?: string | null
          needs_reconnect?: boolean
          refresh_token?: string | null
          scopes?: string | null
          team_id: string
          team_name?: string | null
          token_expiry?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          authed_user_id?: string | null
          bot_user_id?: string | null
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string
          id?: string
          last_posted_at?: string | null
          needs_reconnect?: boolean
          refresh_token?: string | null
          scopes?: string | null
          team_id?: string
          team_name?: string | null
          token_expiry?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      slack_deliveries: {
        Row: {
          channel_id: string
          created_at: string
          error: string | null
          id: string
          meeting_id: string
          message_ts: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          error?: string | null
          id?: string
          meeting_id: string
          message_ts?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          error?: string | null
          id?: string
          meeting_id?: string
          message_ts?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slack_deliveries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "slack_deliveries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_deliveries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      summary_recipient_allowlist: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          note: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          note?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          content: string
          created_at: string
          id: string
          language_detected: string | null
          meeting_id: string
          search_vector: unknown
          speakers: Json | null
          stt_provider: string | null
          word_timestamps: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          language_detected?: string | null
          meeting_id: string
          search_vector?: unknown
          speakers?: Json | null
          stt_provider?: string | null
          word_timestamps?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          language_detected?: string | null
          meeting_id?: string
          search_vector?: unknown
          speakers?: Json | null
          stt_provider?: string | null
          word_timestamps?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          id: string
          is_overage: boolean
          kind: string
          meeting_id: string | null
          occurred_at: string
          plan: string
          seconds: number
          user_id: string
        }
        Insert: {
          id?: string
          is_overage?: boolean
          kind: string
          meeting_id?: string | null
          occurred_at?: string
          plan?: string
          seconds?: number
          user_id: string
        }
        Update: {
          id?: string
          is_overage?: boolean
          kind?: string
          meeting_id?: string | null
          occurred_at?: string
          plan?: string
          seconds?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "usage_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_oauth_tokens: {
        Row: {
          created_at: string
          google_access_token: string | null
          google_refresh_token: string | null
          google_scopes: string | null
          google_token_expiry: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_scopes?: string | null
          google_token_expiry?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          google_access_token?: string | null
          google_refresh_token?: string | null
          google_scopes?: string | null
          google_token_expiry?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          company: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          invited_at: string | null
          source: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          invited_at?: string | null
          source?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          invited_at?: string | null
          source?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          delivered_at: string | null
          error: string | null
          event_type: string
          id: string
          meeting_id: string | null
          payload: Json
          status_code: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event_type: string
          id?: string
          meeting_id?: string | null
          payload: Json
          status_code?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event_type?: string
          id?: string
          meeting_id?: string | null
          payload?: Json
          status_code?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "webhook_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      zoho_connections: {
        Row: {
          access_token: string | null
          api_domain: string
          created_at: string
          id: string
          last_synced_at: string | null
          location: string | null
          needs_reconnect: boolean
          org_id: string | null
          org_name: string | null
          refresh_token: string | null
          scopes: string | null
          token_expiry: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          api_domain: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          location?: string | null
          needs_reconnect?: boolean
          org_id?: string | null
          org_name?: string | null
          refresh_token?: string | null
          scopes?: string | null
          token_expiry?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          api_domain?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          location?: string | null
          needs_reconnect?: boolean
          org_id?: string | null
          org_name?: string | null
          refresh_token?: string | null
          scopes?: string | null
          token_expiry?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      zoho_deliveries: {
        Row: {
          created_at: string
          error: string | null
          id: string
          matched_email: string | null
          meeting_id: string
          module: string
          note_id: string | null
          record_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          matched_email?: string | null
          meeting_id: string
          module: string
          note_id?: string | null
          record_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          matched_email?: string | null
          meeting_id?: string
          module?: string
          note_id?: string | null
          record_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoho_deliveries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meeting_margin"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "zoho_deliveries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoho_deliveries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "slo_meeting_facts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      meeting_margin: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          llm_paise: number | null
          llm_tokens_in: number | null
          llm_tokens_out: number | null
          meeting_id: string | null
          pipeline_runs: number | null
          recall_paise: number | null
          stt_paise: number | null
          stt_provider: string | null
          total_paise: number | null
          user_id: string | null
        }
        Relationships: []
      }
      slo_daily: {
        Row: {
          day: string | null
          email_within_5m_pct: number | null
          emails_sent: number | null
          failed: number | null
          failure_pct: number | null
          insight_latency_pct: number | null
          insight_p95_seconds: number | null
          latency_measurable: number | null
          meetings: number | null
        }
        Relationships: []
      }
      slo_meeting_facts: {
        Row: {
          created_at: string | null
          email_at: string | null
          email_seconds: number | null
          id: string | null
          insight_seconds: number | null
          insights_at: string | null
          recording_ended_at: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      slo_summary_30d: {
        Row: {
          email_target_pct: number | null
          email_within_5m_pct: number | null
          failure_pct: number | null
          failure_target_pct: number | null
          function_errors_30d: number | null
          insight_p95_seconds: number | null
          insights_target_pct: number | null
          insights_within_15m_pct: number | null
          latency_measurable_30d: number | null
          meetings_30d: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      consume_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: {
          allowed: boolean
          remaining: number
          reset_in: number
        }[]
      }
      is_org_admin: { Args: { p_org: string }; Returns: boolean }
      meeting_shared_to_my_org: {
        Args: { p_meeting: string }
        Returns: boolean
      }
      mfa_satisfied: { Args: never; Returns: boolean }
      my_org_id: { Args: never; Returns: string }
      my_org_role: { Args: never; Returns: string }
      record_meeting_cost: {
        Args: {
          p_llm_calls: number
          p_meeting_id: string
          p_models: string[]
          p_recall_seconds?: number
          p_regenerated?: boolean
          p_stt_provider?: string
          p_stt_seconds?: number
          p_tokens_in: number
          p_tokens_out: number
        }
        Returns: undefined
      }
      redeem_access_code: {
        Args: { p_code: string; p_user_id: string }
        Returns: Json
      }
      search_meetings: {
        Args: { max_results?: number; q: string }
        Returns: {
          meeting_id: string
          rank: number
          snippet: string
          source: string
          start_time: string
          title: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
