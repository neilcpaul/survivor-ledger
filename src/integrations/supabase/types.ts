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
      entries: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          away_team_id: string | null
          away_win_prob: number | null
          broadcast: string | null
          home_team_id: string | null
          home_win_prob: number | null
          id: string
          kickoff_at: string | null
          season_type: number
          season_year: number
          updated_at: string
          venue_city: string | null
          venue_indoor: boolean | null
          venue_name: string | null
          venue_state: string | null
          weather_condition: string | null
          weather_temp_f: number | null
          week: number
        }
        Insert: {
          away_team_id?: string | null
          away_win_prob?: number | null
          broadcast?: string | null
          home_team_id?: string | null
          home_win_prob?: number | null
          id: string
          kickoff_at?: string | null
          season_type?: number
          season_year: number
          updated_at?: string
          venue_city?: string | null
          venue_indoor?: boolean | null
          venue_name?: string | null
          venue_state?: string | null
          weather_condition?: string | null
          weather_temp_f?: number | null
          week: number
        }
        Update: {
          away_team_id?: string | null
          away_win_prob?: number | null
          broadcast?: string | null
          home_team_id?: string | null
          home_win_prob?: number | null
          id?: string
          kickoff_at?: string | null
          season_type?: number
          season_year?: number
          updated_at?: string
          venue_city?: string | null
          venue_indoor?: boolean | null
          venue_name?: string | null
          venue_state?: string | null
          weather_condition?: string | null
          weather_temp_f?: number | null
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "games_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      injuries: {
        Row: {
          athlete_id: string | null
          detail: string | null
          id: string
          player_name: string | null
          position: string | null
          status: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          athlete_id?: string | null
          detail?: string | null
          id?: string
          player_name?: string | null
          position?: string | null
          status?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string | null
          detail?: string | null
          id?: string
          player_name?: string | null
          position?: string | null
          status?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "injuries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      picks: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          team_id: string | null
          week: number
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          team_id?: string | null
          week: number
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          team_id?: string | null
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "picks_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      roster_players: {
        Row: {
          athlete_id: string | null
          headshot_url: string | null
          id: string
          jersey_number: string | null
          name: string | null
          position: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          athlete_id?: string | null
          headshot_url?: string | null
          id?: string
          jersey_number?: string | null
          name?: string | null
          position?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string | null
          headshot_url?: string | null
          id?: string
          jersey_number?: string | null
          name?: string | null
          position?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_success_at: string | null
          running_since: string | null
        }
        Insert: {
          id: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          running_since?: string | null
        }
        Update: {
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          running_since?: string | null
        }
        Relationships: []
      }
      teams: {
        Row: {
          abbr: string | null
          conference: string | null
          division: string | null
          id: string
          logo_url: string | null
          name: string | null
          updated_at: string
        }
        Insert: {
          abbr?: string | null
          conference?: string | null
          division?: string | null
          id: string
          logo_url?: string | null
          name?: string | null
          updated_at?: string
        }
        Update: {
          abbr?: string | null
          conference?: string | null
          division?: string | null
          id?: string
          logo_url?: string | null
          name?: string | null
          updated_at?: string
        }
        Relationships: []
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
