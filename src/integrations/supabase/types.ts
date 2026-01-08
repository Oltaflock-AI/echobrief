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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      google_oauth_states: {
        Row: {
          created_at: string
          id: string
          return_to: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          return_to?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          return_to?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      meeting_insights: {
        Row: {
          action_items: Json | null
          created_at: string
          decisions: Json | null
          follow_ups: Json | null
          id: string
          key_points: Json | null
          meeting_id: string
          risks: Json | null
          summary_detailed: string | null
          summary_short: string | null
        }
        Insert: {
          action_items?: Json | null
          created_at?: string
          decisions?: Json | null
          follow_ups?: Json | null
          id?: string
          key_points?: Json | null
          meeting_id: string
          risks?: Json | null
          summary_detailed?: string | null
          summary_short?: string | null
        }
        Update: {
          action_items?: Json | null
          created_at?: string
          decisions?: Json | null
          follow_ups?: Json | null
          id?: string
          key_points?: Json | null
          meeting_id?: string
          risks?: Json | null
          summary_detailed?: string | null
          summary_short?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_insights_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          audio_url: string | null
          calendar_event_id: string | null
          created_at: string
          duration_seconds: number | null
          end_time: string | null
          id: string
          meeting_link: string | null
          source: string | null
          start_time: string
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          calendar_event_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          meeting_link?: string | null
          source?: string | null
          start_time?: string
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_url?: string | null
          calendar_event_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_time?: string | null
          id?: string
          meeting_link?: string | null
          source?: string | null
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          google_access_token: string | null
          google_calendar_connected: boolean | null
          google_refresh_token: string | null
          google_token_expiry: string | null
          id: string
          slack_channel_id: string | null
          slack_channel_name: string | null
          slack_connected: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          google_access_token?: string | null
          google_calendar_connected?: boolean | null
          google_refresh_token?: string | null
          google_token_expiry?: string | null
          id?: string
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          slack_connected?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          google_access_token?: string | null
          google_calendar_connected?: boolean | null
          google_refresh_token?: string | null
          google_token_expiry?: string | null
          id?: string
          slack_channel_id?: string | null
          slack_channel_name?: string | null
          slack_connected?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      slack_messages: {
        Row: {
          channel_id: string
          created_at: string
          error_message: string | null
          id: string
          meeting_id: string
          message_ts: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          meeting_id: string
          message_ts?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          meeting_id?: string
          message_ts?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slack_messages_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          content: string
          created_at: string
          id: string
          meeting_id: string
          speakers: Json | null
          word_timestamps: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          meeting_id: string
          speakers?: Json | null
          word_timestamps?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          meeting_id?: string
          speakers?: Json | null
          word_timestamps?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
