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
      activity_heartbeats: {
        Row: {
          id: string
          interactions: number
          is_active: boolean
          is_focused: boolean
          route: string | null
          session_id: string
          ts: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          interactions?: number
          is_active?: boolean
          is_focused?: boolean
          route?: string | null
          session_id: string
          ts?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          interactions?: number
          is_active?: boolean
          is_focused?: boolean
          route?: string | null
          session_id?: string
          ts?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      activity_idle_periods: {
        Row: {
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          session_id: string
          started_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          session_id: string
          started_at: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          session_id?: string
          started_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
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
      activity_sessions: {
        Row: {
          active_seconds: number
          created_at: string
          ended_at: string | null
          id: string
          idle_seconds: number
          ip: string | null
          last_seen_at: string
          started_at: string
          user_agent: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          active_seconds?: number
          created_at?: string
          ended_at?: string | null
          id?: string
          idle_seconds?: number
          ip?: string | null
          last_seen_at?: string
          started_at?: string
          user_agent?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          active_seconds?: number
          created_at?: string
          ended_at?: string | null
          id?: string
          idle_seconds?: number
          ip?: string | null
          last_seen_at?: string
          started_at?: string
          user_agent?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      activity_url_visits: {
        Row: {
          created_at: string
          domain: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          path: string | null
          session_id: string | null
          started_at: string
          title: string | null
          user_id: string
          was_focused: boolean
          was_idle: boolean
          workspace_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          path?: string | null
          session_id?: string | null
          started_at?: string
          title?: string | null
          user_id: string
          was_focused?: boolean
          was_idle?: boolean
          workspace_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          path?: string | null
          session_id?: string | null
          started_at?: string
          title?: string | null
          user_id?: string
          was_focused?: boolean
          was_idle?: boolean
          workspace_id?: string
        }
        Relationships: []
      }
      automations: {
        Row: {
          actions: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          project_id: string
          trigger: Json
        }
        Insert: {
          actions: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          project_id: string
          trigger: Json
        }
        Update: {
          actions?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          project_id?: string
          trigger?: Json
        }
        Relationships: [
          {
            foreignKeyName: "automations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          external_context_id: string | null
          id: string
          task_id: string | null
          title: string | null
          type: Database["public"]["Enums"]["conversation_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          external_context_id?: string | null
          id?: string
          task_id?: string | null
          title?: string | null
          type: Database["public"]["Enums"]["conversation_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          external_context_id?: string | null
          id?: string
          task_id?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          config: Json
          created_at: string
          id: string
          name: string
          position: number
          project_id: string
          type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          name: string
          position?: number
          project_id: string
          type: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_activity_stats: {
        Row: {
          active_seconds: number
          activity_score: number
          by_project: Json
          computed_at: string
          day: string
          distracting_seconds: number
          first_seen_at: string | null
          hourly_buckets: Json
          id: string
          idle_seconds: number
          last_seen_at: string | null
          neutral_seconds: number
          online_seconds: number
          productive_seconds: number
          sessions_count: number
          tasks_completed: number
          tasks_completed_inbox: number
          tasks_completed_with_project: number
          top_domains: Json
          user_id: string
          workspace_id: string
        }
        Insert: {
          active_seconds?: number
          activity_score?: number
          by_project?: Json
          computed_at?: string
          day: string
          distracting_seconds?: number
          first_seen_at?: string | null
          hourly_buckets?: Json
          id?: string
          idle_seconds?: number
          last_seen_at?: string | null
          neutral_seconds?: number
          online_seconds?: number
          productive_seconds?: number
          sessions_count?: number
          tasks_completed?: number
          tasks_completed_inbox?: number
          tasks_completed_with_project?: number
          top_domains?: Json
          user_id: string
          workspace_id: string
        }
        Update: {
          active_seconds?: number
          activity_score?: number
          by_project?: Json
          computed_at?: string
          day?: string
          distracting_seconds?: number
          first_seen_at?: string | null
          hourly_buckets?: Json
          id?: string
          idle_seconds?: number
          last_seen_at?: string | null
          neutral_seconds?: number
          online_seconds?: number
          productive_seconds?: number
          sessions_count?: number
          tasks_completed?: number
          tasks_completed_inbox?: number
          tasks_completed_with_project?: number
          top_domains?: Json
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      domain_categories: {
        Row: {
          category: string
          color: string | null
          created_at: string
          created_by: string | null
          domain: string
          id: string
          workspace_id: string
        }
        Insert: {
          category: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          workspace_id: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      external_api_keys: {
        Row: {
          created_at: string
          created_by: string
          default_assignee_id: string | null
          default_project_id: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_assignee_id?: string | null
          default_project_id?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_assignee_id?: string | null
          default_project_id?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      external_links: {
        Row: {
          created_at: string
          id: string
          preview: Json | null
          source_id: string | null
          source_system: string
          source_url: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          preview?: Json | null
          source_id?: string | null
          source_system: string
          source_url: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          preview?: Json | null
          source_id?: string | null
          source_system?: string
          source_url?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_links_task_id_fkey"
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
      fleetdesk_task_links: {
        Row: {
          external_ref: string
          id: string
          last_sync_source: string | null
          last_synced_at: string
          task_id: string
        }
        Insert: {
          external_ref: string
          id?: string
          last_sync_source?: string | null
          last_synced_at?: string
          task_id: string
        }
        Update: {
          external_ref?: string
          id?: string
          last_sync_source?: string | null
          last_synced_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleetdesk_task_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          name: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          name?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "labels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      labels_backup_pre_phase4: {
        Row: {
          color: string | null
          created_at: string | null
          id: string | null
          is_favorite: boolean | null
          name: string | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string | null
          is_favorite?: boolean | null
          name?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string | null
          is_favorite?: boolean | null
          name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      meeting_invitations: {
        Row: {
          created_at: string
          id: string
          invited_by: string
          invitee_email: string | null
          invitee_name: string | null
          invitee_user_id: string | null
          proposed_date: string | null
          proposed_message: string | null
          proposed_time: string | null
          responded_at: string | null
          status: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          invitee_email?: string | null
          invitee_name?: string | null
          invitee_user_id?: string | null
          proposed_date?: string | null
          proposed_message?: string | null
          proposed_time?: string | null
          responded_at?: string | null
          status?: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string
          invitee_email?: string | null
          invitee_name?: string | null
          invitee_user_id?: string | null
          proposed_date?: string | null
          proposed_message?: string | null
          proposed_time?: string | null
          responded_at?: string | null
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_invitations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          mentions: Json
          user_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          mentions?: Json
          user_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          mentions?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      productivity_admins: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          is_super: boolean
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          is_super?: boolean
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          is_super?: boolean
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          last_seen_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_seen_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_seen_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          added_at: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Insert: {
          added_at?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Update: {
          added_at?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_teams: {
        Row: {
          added_at: string
          added_by: string | null
          default_role: Database["public"]["Enums"]["project_role"]
          project_id: string
          team_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          default_role?: Database["public"]["Enums"]["project_role"]
          project_id: string
          team_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          default_role?: Database["public"]["Enums"]["project_role"]
          project_id?: string
          team_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_favorite: boolean
          is_inbox: boolean
          name: string
          owner_id: string | null
          parent_id: string | null
          position: number
          team_id: string | null
          updated_at: string
          user_id: string
          view_type: string
          visibility: Database["public"]["Enums"]["project_visibility"]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          color?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_favorite?: boolean
          is_inbox?: boolean
          name: string
          owner_id?: string | null
          parent_id?: string | null
          position?: number
          team_id?: string | null
          updated_at?: string
          user_id: string
          view_type?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_favorite?: boolean
          is_inbox?: boolean
          name?: string
          owner_id?: string | null
          parent_id?: string | null
          position?: number
          team_id?: string | null
          updated_at?: string
          user_id?: string
          view_type?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      projects_backup_pre_phase4: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_favorite: boolean | null
          is_inbox: boolean | null
          name: string | null
          parent_id: string | null
          position: number | null
          updated_at: string | null
          user_id: string | null
          view_type: string | null
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_favorite?: boolean | null
          is_inbox?: boolean | null
          name?: string | null
          parent_id?: string | null
          position?: number | null
          updated_at?: string | null
          user_id?: string | null
          view_type?: string | null
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_favorite?: boolean | null
          is_inbox?: boolean | null
          name?: string | null
          parent_id?: string | null
          position?: number | null
          updated_at?: string | null
          user_id?: string | null
          view_type?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recurring_task_completions: {
        Row: {
          completed_at: string
          created_at: string
          duration_minutes: number | null
          id: string
          occurrence_date: string
          occurrence_time: string | null
          task_id: string
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          occurrence_date: string
          occurrence_time?: string | null
          task_id: string
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          occurrence_date?: string
          occurrence_time?: string | null
          task_id?: string
          title?: string
          user_id?: string
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      task_activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          payload: Json | null
          task_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          payload?: Json | null
          task_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          payload?: Json | null
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignment_status: string
          responded_at: string | null
          response_reason: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_status?: string
          responded_at?: string | null
          response_reason?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_status?: string
          responded_at?: string | null
          response_reason?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          id: string
          mime_type: string | null
          name: string
          size: number | null
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          size?: number | null
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          size?: number | null
          storage_path?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          mentions: Json
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          mentions?: Json
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          mentions?: Json
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_custom_values: {
        Row: {
          custom_field_id: string
          task_id: string
          value: Json | null
        }
        Insert: {
          custom_field_id: string
          task_id: string
          value?: Json | null
        }
        Update: {
          custom_field_id?: string
          task_id?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "task_custom_values_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_custom_values_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          depends_on_task_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          depends_on_task_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          depends_on_task_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
      task_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          is_done: boolean
          name: string
          position: number
          project_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_done?: boolean
          name: string
          position?: number
          project_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_done?: boolean
          name?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_statuses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee: string | null
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          due_date: string | null
          due_datetime: string | null
          due_string: string | null
          due_time: string | null
          duration_minutes: number | null
          external_ref: string | null
          external_source: string | null
          gcal_event_id: string | null
          google_calendar_event_id: string | null
          id: string
          is_meeting: boolean
          last_sync_source: string | null
          meeting_url: string | null
          parent_id: string | null
          position: number
          priority: number
          project_id: string | null
          recurrence_interval: number | null
          recurrence_rule: string | null
          recurrence_type: string | null
          section_id: string | null
          status_id: string | null
          task_number: number | null
          title: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          assignee?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          due_date?: string | null
          due_datetime?: string | null
          due_string?: string | null
          due_time?: string | null
          duration_minutes?: number | null
          external_ref?: string | null
          external_source?: string | null
          gcal_event_id?: string | null
          google_calendar_event_id?: string | null
          id?: string
          is_meeting?: boolean
          last_sync_source?: string | null
          meeting_url?: string | null
          parent_id?: string | null
          position?: number
          priority?: number
          project_id?: string | null
          recurrence_interval?: number | null
          recurrence_rule?: string | null
          recurrence_type?: string | null
          section_id?: string | null
          status_id?: string | null
          task_number?: number | null
          title: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          assignee?: string | null
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          due_date?: string | null
          due_datetime?: string | null
          due_string?: string | null
          due_time?: string | null
          duration_minutes?: number | null
          external_ref?: string | null
          external_source?: string | null
          gcal_event_id?: string | null
          google_calendar_event_id?: string | null
          id?: string
          is_meeting?: boolean
          last_sync_source?: string | null
          meeting_url?: string | null
          parent_id?: string | null
          position?: number
          priority?: number
          project_id?: string | null
          recurrence_interval?: number | null
          recurrence_rule?: string | null
          recurrence_type?: string | null
          section_id?: string | null
          status_id?: string | null
          task_number?: number | null
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
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
          {
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "task_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      tasks_backup_pre_phase4: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          due_date: string | null
          due_datetime: string | null
          due_string: string | null
          due_time: string | null
          duration_minutes: number | null
          google_calendar_event_id: string | null
          id: string | null
          parent_id: string | null
          position: number | null
          priority: number | null
          project_id: string | null
          recurrence_interval: number | null
          recurrence_rule: string | null
          recurrence_type: string | null
          section_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          due_date?: string | null
          due_datetime?: string | null
          due_string?: string | null
          due_time?: string | null
          duration_minutes?: number | null
          google_calendar_event_id?: string | null
          id?: string | null
          parent_id?: string | null
          position?: number | null
          priority?: number | null
          project_id?: string | null
          recurrence_interval?: number | null
          recurrence_rule?: string | null
          recurrence_type?: string | null
          section_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          due_date?: string | null
          due_datetime?: string | null
          due_string?: string | null
          due_time?: string | null
          duration_minutes?: number | null
          google_calendar_event_id?: string | null
          id?: string | null
          parent_id?: string | null
          position?: number | null
          priority?: number | null
          project_id?: string | null
          recurrence_interval?: number | null
          recurrence_rule?: string | null
          recurrence_type?: string | null
          section_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          joined_at: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transkriptor_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          access_token: string
          created_at: string
          id: string
          metadata: Json
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          metadata?: Json
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          metadata?: Json
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          auto_dark_mode: boolean
          celebrations: boolean
          color_mode: string
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
          next_week_start: string
          notify_at_due_time: boolean
          notify_on_comments: boolean
          notify_on_reminders: boolean
          notify_on_task_complete: boolean
          notify_overdue: boolean
          quick_add_chips: Json
          reminder_channels: Json
          reminder_offsets: Json
          reminder_offsets_minutes: Json
          show_calendar_status: boolean
          show_sidebar_counts: boolean
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
          color_mode?: string
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
          next_week_start?: string
          notify_at_due_time?: boolean
          notify_on_comments?: boolean
          notify_on_reminders?: boolean
          notify_on_task_complete?: boolean
          notify_overdue?: boolean
          quick_add_chips?: Json
          reminder_channels?: Json
          reminder_offsets?: Json
          reminder_offsets_minutes?: Json
          show_calendar_status?: boolean
          show_sidebar_counts?: boolean
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
          color_mode?: string
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
          next_week_start?: string
          notify_at_due_time?: boolean
          notify_on_comments?: boolean
          notify_on_reminders?: boolean
          notify_on_task_complete?: boolean
          notify_overdue?: boolean
          quick_add_chips?: Json
          reminder_channels?: Json
          reminder_offsets?: Json
          reminder_offsets_minutes?: Json
          show_calendar_status?: boolean
          show_sidebar_counts?: boolean
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
      workspace_api_keys: {
        Row: {
          created_at: string
          created_by: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          scopes: Json
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          scopes?: Json
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          scopes?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          workspace_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          workspace_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_tracking_settings: {
        Row: {
          enable_team_visibility: boolean
          heartbeat_seconds: number
          idle_threshold_minutes: number
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          enable_team_visibility?: boolean
          heartbeat_seconds?: number
          idle_threshold_minutes?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          enable_team_visibility?: boolean
          heartbeat_seconds?: number
          idle_threshold_minutes?: number
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_webhooks: {
        Row: {
          created_at: string
          created_by: string
          enabled: boolean
          events: Json
          id: string
          secret: string
          url: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          enabled?: boolean
          events?: Json
          id?: string
          secret: string
          url: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          enabled?: boolean
          events?: Json
          id?: string
          secret?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_webhooks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          is_personal: boolean
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_personal?: boolean
          name: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_personal?: boolean
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_insert_task: {
        Args: { _project_id: string; _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      can_view_activity: {
        Args: { _target_user: string; _viewer: string; _workspace_id: string }
        Returns: boolean
      }
      create_project_secure: {
        Args: {
          p_color: string
          p_description?: string
          p_is_favorite?: boolean
          p_name: string
          p_parent_id?: string
          p_view_type?: string
          p_workspace_id: string
        }
        Returns: {
          archived_at: string | null
          color: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_favorite: boolean
          is_inbox: boolean
          name: string
          owner_id: string | null
          parent_id: string | null
          position: number
          team_id: string | null
          updated_at: string
          user_id: string
          view_type: string
          visibility: Database["public"]["Enums"]["project_visibility"]
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_task_secure: {
        Args: {
          p_deadline?: string
          p_description?: string
          p_due_date?: string
          p_due_string?: string
          p_due_time?: string
          p_duration_minutes?: number
          p_google_calendar_event_id?: string
          p_parent_id?: string
          p_priority?: number
          p_project_id: string
          p_recurrence_rule?: string
          p_section_id?: string
          p_title: string
          p_workspace_id: string
        }
        Returns: {
          assignee: string | null
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          due_date: string | null
          due_datetime: string | null
          due_string: string | null
          due_time: string | null
          duration_minutes: number | null
          external_ref: string | null
          external_source: string | null
          gcal_event_id: string | null
          google_calendar_event_id: string | null
          id: string
          is_meeting: boolean
          last_sync_source: string | null
          meeting_url: string | null
          parent_id: string | null
          position: number
          priority: number
          project_id: string | null
          recurrence_interval: number | null
          recurrence_rule: string | null
          recurrence_type: string | null
          section_id: string | null
          status_id: string | null
          task_number: number | null
          title: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      debug_try_insert_task: { Args: { _project_id: string }; Returns: Json }
      debug_whoami: { Args: never; Returns: Json }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_project_access: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      has_task_access: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_productivity_admin: { Args: { _user_id: string }; Returns: boolean }
      is_productivity_super_admin: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_workspace_admin: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      project_role: {
        Args: { _project_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["project_role"]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reschedule_single_occurrence: {
        Args: {
          p_new_date: string
          p_new_duration: number
          p_new_time: string
          p_occurrence_date: string
          p_series_due_date: string
          p_series_due_time: string
          p_series_recurrence_rule: string
          p_task_id: string
        }
        Returns: string
      }
      task_insert_check: {
        Args: { _project_id: string; _user_id: string; _workspace_id?: string }
        Returns: boolean
      }
      touch_last_seen: { Args: never; Returns: undefined }
      workspace_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      conversation_type: "workspace" | "task" | "context"
      project_role: "admin" | "editor" | "commenter" | "viewer"
      project_visibility: "private" | "team" | "workspace"
      team_role: "lead" | "member"
      workspace_role: "owner" | "admin" | "member" | "guest"
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
      conversation_type: ["workspace", "task", "context"],
      project_role: ["admin", "editor", "commenter", "viewer"],
      project_visibility: ["private", "team", "workspace"],
      team_role: ["lead", "member"],
      workspace_role: ["owner", "admin", "member", "guest"],
    },
  },
} as const
