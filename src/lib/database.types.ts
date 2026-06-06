export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string | null
          role_granted: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          role_granted?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          role_granted?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          profile_id: string
          role: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          profile_id: string
          role?: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          profile_id?: string
          role?: string
        }
        Relationships: []
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          cover_url: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          last_message_at: string
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          last_message_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          last_message_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_progress: {
        Row: {
          level: number
          posts_total: number
          profile_id: string
          updated_at: string
          views_total: number
          xp: number
        }
        Insert: {
          level?: number
          posts_total?: number
          profile_id: string
          updated_at?: string
          views_total?: number
          xp?: number
        }
        Update: {
          level?: number
          posts_total?: number
          profile_id?: string
          updated_at?: string
          views_total?: number
          xp?: number
        }
        Relationships: []
      }
      join_events: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role_granted: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role_granted: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role_granted?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      levels: {
        Row: {
          color: string
          icon: string
          level: number
          perks: string[]
          title: string
          xp_required: number
        }
        Insert: {
          color?: string
          icon: string
          level: number
          perks?: string[]
          title: string
          xp_required: number
        }
        Update: {
          color?: string
          icon?: string
          level?: number
          perks?: string[]
          title?: string
          xp_required?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      scripts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          creator_id: string | null
          details: Json | null
          external_id: string | null
          id: string
          scheduled_date: string
          status: string
          target_seconds: number
          thumbnail: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          details?: Json | null
          external_id?: string | null
          id?: string
          scheduled_date?: string
          status?: string
          target_seconds?: number
          thumbnail?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          details?: Json | null
          external_id?: string | null
          id?: string
          scheduled_date?: string
          status?: string
          target_seconds?: number
          thumbnail?: string | null
          title?: string
        }
        Relationships: []
      }
      xp_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          profile_id: string
          reason: string | null
          source: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          profile_id: string
          reason?: string | null
          source?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          profile_id?: string
          reason?: string | null
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_member: {
        Args: { p_conversation: string; p_profile: string }
        Returns: undefined
      }
      add_xp: {
        Args: { p_amount: number; p_profile: string; p_reason?: string; p_source?: string }
        Returns: {
          level: number
          posts_total: number
          profile_id: string
          updated_at: string
          views_total: number
          xp: number
        }
      }
      create_group: {
        Args: { p_members: string[]; p_title: string }
        Returns: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          last_message_at: string
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          title: string | null
          type: string
          updated_at: string
        }
      }
      get_or_create_conversation: {
        Args: { p_subject?: string }
        Returns: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          last_message_at: string
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          title: string | null
          type: string
          updated_at: string
        }
      }
      grant_xp: {
        Args: { p_amount: number; p_profile: string; p_reason?: string }
        Returns: {
          level: number
          posts_total: number
          profile_id: string
          updated_at: string
          views_total: number
          xp: number
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_participant: { Args: { p_conversation: string }; Returns: boolean }
      level_for_xp: { Args: { p_xp: number }; Returns: number }
      mark_read: { Args: { p_conversation: string }; Returns: undefined }
      redeem_code: {
        Args: { p_code: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      remove_member: {
        Args: { p_conversation: string; p_profile: string }
        Returns: undefined
      }
      rotate_access_code: {
        Args: { p_new_code: string; p_role: Database["public"]["Enums"]["user_role"] }
        Returns: string
      }
      shares_conversation: { Args: { p_other: string }; Returns: boolean }
      unread_counts: {
        Args: never
        Returns: { conversation_id: string; unread: number }[]
      }
    }
    Enums: {
      conversation_status: "open" | "pending" | "closed"
      user_role: "customer" | "admin" | "creator" | "bot"
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
    Enums: {
      conversation_status: ["open", "pending", "closed"],
      user_role: ["customer", "admin", "creator", "bot"],
    },
  },
} as const
