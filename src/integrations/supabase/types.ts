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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          payload: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          payload?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          payload?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      filters: {
        Row: {
          color: string
          created_at: string
          id: string
          is_favorite: boolean
          name: string
          position: number
          query: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          name: string
          position?: number
          query: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          name?: string
          position?: number
          query?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      labels: {
        Row: {
          color: string
          created_at: string
          id: string
          is_favorite: boolean
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      labels_backup_pre_phase1: {
        Row: {
          color: string | null
          created_at: string | null
          id: string | null
          name: string | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          description: string | null
          id: string
          is_favorite: boolean
          is_inbox: boolean
          name: string
          parent_id: string | null
          position: number
          updated_at: string
          user_id: string
          view_type: string
        }
        Insert: {
          archived_at?: string | null
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          is_inbox?: boolean
          name: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          user_id: string
          view_type?: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          is_inbox?: boolean
          name?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          user_id?: string
          view_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects_backup_pre_phase1: {
        Row: {
          color: string | null
          created_at: string | null
          id: string | null
          is_inbox: boolean | null
          name: string | null
          position: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string | null
          is_inbox?: boolean | null
          name?: string | null
          position?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string | null
          is_inbox?: boolean | null
          name?: string | null
          position?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          channel: string
          created_at: string
          fired_at: string | null
          id: string
          notification_sent: boolean
          relative_minutes: number | null
          task_id: string
          trigger_at: string
          type: string
        }
        Insert: {
          channel?: string
          created_at?: string
          fired_at?: string | null
          id?: string
          notification_sent?: boolean
          relative_minutes?: number | null
          task_id: string
          trigger_at: string
          type: string
        }
        Update: {
          channel?: string
          created_at?: string
          fired_at?: string | null
          id?: string
          notification_sent?: boolean
          relative_minutes?: number | null
          task_id?: string
          trigger_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          id: string
          is_collapsed: boolean
          name: string
          position: number
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_collapsed?: boolean
          name: string
          position?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_collapsed?: boolean
          name?: string
          position?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_labels: {
        Row: {
          label_id: string
          task_id: string
        }
        Insert: {
          label_id: string
          task_id: string
        }
        Update: {
          label_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_labels_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          deadline: string | null
          description: string | null
          due_date: string | null
          due_datetime: string | null
          due_string: string | null
          due_time: string | null
          duration_minutes: number | null
          google_calendar_event_id: string | null
          id: string
          parent_id: string | null
          position: number
          priority: number
          project_id: string | null
          recurrence_interval: number | null
          recurrence_rule: string | null
          recurrence_type: string | null
          section_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          due_date?: string | null
          due_datetime?: string | null
          due_string?: string | null
          due_time?: string | null
          duration_minutes?: number | null
          google_calendar_event_id?: string | null
          id?: string
          parent_id?: string | null
          position?: number
          priority?: number
          project_id?: string | null
          recurrence_interval?: number | null
          recurrence_rule?: string | null
          recurrence_type?: string | null
          section_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          due_date?: string | null
          due_datetime?: string | null
          due_string?: string | null
          due_time?: string | null
          duration_minutes?: number | null
          google_calendar_event_id?: string | null
          id?: string
          parent_id?: string | null
          position?: number
          priority?: number
          project_id?: string | null
          recurrence_interval?: number | null
          recurrence_rule?: string | null
          recurrence_type?: string | null
          section_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks_backup_pre_phase1: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          google_calendar_event_id: string | null
          id: string | null
          parent_id: string | null
          position: number | null
          priority: number | null
          project_id: string | null
          recurrence_interval: number | null
          recurrence_type: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          google_calendar_event_id?: string | null
          id?: string | null
          parent_id?: string | null
          position?: number | null
          priority?: number | null
          project_id?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          google_calendar_event_id?: string | null
          id?: string | null
          parent_id?: string | null
          position?: number | null
          priority?: number | null
          project_id?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          auto_dark_mode: boolean
          celebrations: boolean
          created_at: string
          daily_goal: number
          date_format: string
          days_off: Json
          default_reminder_minutes: number
          delete_calendar_event_on_complete: boolean
          dismissed_install_prompt: boolean
          home_page: string
          karma_enabled: boolean
          language: string
          quick_add_chips: Json
          reminder_channels: Json
          show_task_description: boolean
          sidebar_hidden: Json
          sidebar_order: Json
          smart_date_recognition: boolean
          theme: string
          time_format: string
          timezone: string
          updated_at: string
          user_id: string
          vacation_mode: boolean
          week_start: number
          weekly_goal: number
        }
        Insert: {
          auto_dark_mode?: boolean
          celebrations?: boolean
          created_at?: string
          daily_goal?: number
          date_format?: string
          days_off?: Json
          default_reminder_minutes?: number
          delete_calendar_event_on_complete?: boolean
          dismissed_install_prompt?: boolean
          home_page?: string
          karma_enabled?: boolean
          language?: string
          quick_add_chips?: Json
          reminder_channels?: Json
          show_task_description?: boolean
          sidebar_hidden?: Json
          sidebar_order?: Json
          smart_date_recognition?: boolean
          theme?: string
          time_format?: string
          timezone?: string
          updated_at?: string
          user_id: string
          vacation_mode?: boolean
          week_start?: number
          weekly_goal?: number
        }
        Update: {
          auto_dark_mode?: boolean
          celebrations?: boolean
          created_at?: string
          daily_goal?: number
          date_format?: string
          days_off?: Json
          default_reminder_minutes?: number
          delete_calendar_event_on_complete?: boolean
          dismissed_install_prompt?: boolean
          home_page?: string
          karma_enabled?: boolean
          language?: string
          quick_add_chips?: Json
          reminder_channels?: Json
          show_task_description?: boolean
          sidebar_hidden?: Json
          sidebar_order?: Json
          smart_date_recognition?: boolean
          theme?: string
          time_format?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          vacation_mode?: boolean
          week_start?: number
          weekly_goal?: number
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
