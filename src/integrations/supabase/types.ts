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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      active_calls: {
        Row: {
          agent_id: string | null
          caller_name: string | null
          caller_number: string | null
          ended_at: string | null
          id: string
          metadata: Json
          started_at: string
          status: string
          stream_url: string | null
          updated_at: string
          user_id: string
          vapi_call_id: string | null
        }
        Insert: {
          agent_id?: string | null
          caller_name?: string | null
          caller_number?: string | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          started_at?: string
          status?: string
          stream_url?: string | null
          updated_at?: string
          user_id: string
          vapi_call_id?: string | null
        }
        Update: {
          agent_id?: string | null
          caller_name?: string | null
          caller_number?: string | null
          ended_at?: string | null
          id?: string
          metadata?: Json
          started_at?: string
          status?: string
          stream_url?: string | null
          updated_at?: string
          user_id?: string
          vapi_call_id?: string | null
        }
        Relationships: []
      }
      agent_configs: {
        Row: {
          advanced_config: Json | null
          agent_type: string
          config: Json | null
          created_at: string | null
          description: string | null
          goodbye: string | null
          greeting: string | null
          hipaa_enabled: boolean | null
          id: string
          is_trial: boolean | null
          is_web_only: boolean | null
          minutes_allowance: number | null
          minutes_used: number | null
          name: string
          phone_number: string | null
          status: string
          total_minutes_used: number | null
          transfer_directory: Json | null
          trial_ends_at: string | null
          twilio_sid: string | null
          updated_at: string | null
          user_id: string
          vapi_assistant_id: string | null
          voice_id: string | null
          widget_config: Json | null
        }
        Insert: {
          advanced_config?: Json | null
          agent_type?: string
          config?: Json | null
          created_at?: string | null
          description?: string | null
          goodbye?: string | null
          greeting?: string | null
          hipaa_enabled?: boolean | null
          id?: string
          is_trial?: boolean | null
          is_web_only?: boolean | null
          minutes_allowance?: number | null
          minutes_used?: number | null
          name: string
          phone_number?: string | null
          status?: string
          total_minutes_used?: number | null
          transfer_directory?: Json | null
          trial_ends_at?: string | null
          twilio_sid?: string | null
          updated_at?: string | null
          user_id: string
          vapi_assistant_id?: string | null
          voice_id?: string | null
          widget_config?: Json | null
        }
        Update: {
          advanced_config?: Json | null
          agent_type?: string
          config?: Json | null
          created_at?: string | null
          description?: string | null
          goodbye?: string | null
          greeting?: string | null
          hipaa_enabled?: boolean | null
          id?: string
          is_trial?: boolean | null
          is_web_only?: boolean | null
          minutes_allowance?: number | null
          minutes_used?: number | null
          name?: string
          phone_number?: string | null
          status?: string
          total_minutes_used?: number | null
          transfer_directory?: Json | null
          trial_ends_at?: string | null
          twilio_sid?: string | null
          updated_at?: string | null
          user_id?: string
          vapi_assistant_id?: string | null
          voice_id?: string | null
          widget_config?: Json | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string
          content: string
          created_at: string
          excerpt: string | null
          featured_image: string | null
          id: string
          published_at: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          published_at?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_requests: {
        Row: {
          appointment_type: string | null
          attendee_email: string | null
          attendee_name: string
          call_log_id: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string | null
          duration_minutes: number | null
          expires_at: string | null
          id: string
          notes: string | null
          phone_number: string
          requested_datetime: string
          status: string | null
          updated_at: string | null
          verification_id: string | null
        }
        Insert: {
          appointment_type?: string | null
          attendee_email?: string | null
          attendee_name: string
          call_log_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          phone_number: string
          requested_datetime: string
          status?: string | null
          updated_at?: string | null
          verification_id?: string | null
        }
        Update: {
          appointment_type?: string | null
          attendee_email?: string | null
          attendee_name?: string
          call_log_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          phone_number?: string
          requested_datetime?: string
          status?: string | null
          updated_at?: string | null
          verification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "campaign_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "phone_verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_bookings: {
        Row: {
          appointment_datetime: string
          appointment_type: string | null
          attendee_email: string | null
          attendee_name: string | null
          attendee_phone: string | null
          booking_source: string | null
          booking_status: string
          call_log_id: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          duration_minutes: number
          external_booking_id: string | null
          google_event_id: string | null
          google_integration_id: string | null
          google_integration_id_text: string | null
          id: string
          idempotency_key: string | null
          integration_id: string | null
          metadata: Json | null
          notes: string | null
          provider: string | null
          reminder_sent_at: string | null
          updated_at: string
        }
        Insert: {
          appointment_datetime: string
          appointment_type?: string | null
          attendee_email?: string | null
          attendee_name?: string | null
          attendee_phone?: string | null
          booking_source?: string | null
          booking_status?: string
          call_log_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          duration_minutes?: number
          external_booking_id?: string | null
          google_event_id?: string | null
          google_integration_id?: string | null
          google_integration_id_text?: string | null
          id?: string
          idempotency_key?: string | null
          integration_id?: string | null
          metadata?: Json | null
          notes?: string | null
          provider?: string | null
          reminder_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          appointment_datetime?: string
          appointment_type?: string | null
          attendee_email?: string | null
          attendee_name?: string | null
          attendee_phone?: string | null
          booking_source?: string | null
          booking_status?: string
          call_log_id?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          duration_minutes?: number
          external_booking_id?: string | null
          google_event_id?: string | null
          google_integration_id?: string | null
          google_integration_id_text?: string | null
          id?: string
          idempotency_key?: string | null
          integration_id?: string | null
          metadata?: Json | null
          notes?: string | null
          provider?: string | null
          reminder_sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_bookings_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_bookings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "campaign_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_bookings_google_integration_id_fkey"
            columns: ["google_integration_id"]
            isOneToOne: false
            referencedRelation: "google_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_bookings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_tools: {
        Row: {
          agent_id: string
          campaign_id: string | null
          configuration: Json | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          tool_name: string
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          campaign_id?: string | null
          configuration?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          tool_name?: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          campaign_id?: string | null
          configuration?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          tool_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_tools_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      call_events: {
        Row: {
          active_call_id: string
          call_log_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          active_call_id: string
          call_log_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          active_call_id?: string
          call_log_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "call_events_active_call_id_fkey"
            columns: ["active_call_id"]
            isOneToOne: false
            referencedRelation: "active_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          agent_id: string | null
          call_sid: string
          created_at: string | null
          duration: number | null
          end_time: string | null
          from_number: string | null
          id: string
          start_time: string | null
          status: string | null
          to_number: string | null
          transfer_count: number | null
        }
        Insert: {
          agent_id?: string | null
          call_sid: string
          created_at?: string | null
          duration?: number | null
          end_time?: string | null
          from_number?: string | null
          id?: string
          start_time?: string | null
          status?: string | null
          to_number?: string | null
          transfer_count?: number | null
        }
        Update: {
          agent_id?: string | null
          call_sid?: string
          created_at?: string | null
          duration?: number | null
          end_time?: string | null
          from_number?: string | null
          id?: string
          start_time?: string | null
          status?: string | null
          to_number?: string | null
          transfer_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      call_recordings: {
        Row: {
          call_log_id: string
          created_at: string | null
          id: string
          recording_url: string | null
          transcript_url: string | null
        }
        Insert: {
          call_log_id: string
          created_at?: string | null
          id?: string
          recording_url?: string | null
          transcript_url?: string | null
        }
        Update: {
          call_log_id?: string
          created_at?: string | null
          id?: string
          recording_url?: string | null
          transcript_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_recordings_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_call_log"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_consent_attestations: {
        Row: {
          attested_at: string
          attested_by_email: string | null
          campaign_id: string
          consent_notes: string | null
          consent_source: string
          contact_count: number
          created_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          attested_at?: string
          attested_by_email?: string | null
          campaign_id: string
          consent_notes?: string | null
          consent_source: string
          contact_count?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          attested_at?: string
          attested_by_email?: string | null
          campaign_id?: string
          consent_notes?: string | null
          consent_source?: string
          contact_count?: number
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_consent_attestations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          call_attempts: number | null
          campaign_id: string | null
          created_at: string | null
          first_name: string
          id: string
          last_call_at: string | null
          last_name: string
          metadata: Json | null
          phone_number: string
          status: string
          updated_at: string | null
        }
        Insert: {
          call_attempts?: number | null
          campaign_id?: string | null
          created_at?: string | null
          first_name: string
          id?: string
          last_call_at?: string | null
          last_name: string
          metadata?: Json | null
          phone_number: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          call_attempts?: number | null
          campaign_id?: string | null
          created_at?: string | null
          first_name?: string
          id?: string
          last_call_at?: string | null
          last_name?: string
          metadata?: Json | null
          phone_number?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_integrations: {
        Row: {
          campaign_id: string
          configuration: Json
          created_at: string
          id: string
          integration_id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          campaign_id: string
          configuration?: Json
          created_at?: string
          id?: string
          integration_id: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          configuration?: Json
          created_at?: string
          id?: string
          integration_id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_integrations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_integrations_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          agent_id: string | null
          config: Json | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          scheduled_start: string | null
          status: string
          updated_at: string | null
          user_id: string | null
          webhook_url: string | null
        }
        Insert: {
          agent_id?: string | null
          config?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          scheduled_start?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
          webhook_url?: string | null
        }
        Update: {
          agent_id?: string | null
          config?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          scheduled_start?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      cookie_consent_logs: {
        Row: {
          analytics: boolean
          consent_given_at: string
          created_at: string
          essential: boolean
          id: string
          ip_address: string | null
          marketing: boolean
          session_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          analytics?: boolean
          consent_given_at?: string
          created_at?: string
          essential?: boolean
          id?: string
          ip_address?: string | null
          marketing?: boolean
          session_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          analytics?: boolean
          consent_given_at?: string
          created_at?: string
          essential?: boolean
          id?: string
          ip_address?: string | null
          marketing?: boolean
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cookie_consent_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          call_log_id: string | null
          created_at: string
          credits_amount: number
          description: string | null
          id: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          call_log_id?: string | null
          created_at?: string
          credits_amount: number
          description?: string | null
          id?: string
          transaction_type: string
          user_id: string
        }
        Update: {
          call_log_id?: string | null
          created_at?: string
          credits_amount?: number
          description?: string | null
          id?: string
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_voices: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          updated_at: string | null
          voice_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string | null
          voice_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_voices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          company_name: string
          created_at: string | null
          email: string
          forwarded: boolean | null
          full_name: string
          id: string
          message: string | null
          phone: string
          team_size: string | null
        }
        Insert: {
          company_name: string
          created_at?: string | null
          email: string
          forwarded?: boolean | null
          full_name: string
          id?: string
          message?: string | null
          phone: string
          team_size?: string | null
        }
        Update: {
          company_name?: string
          created_at?: string | null
          email?: string
          forwarded?: boolean | null
          full_name?: string
          id?: string
          message?: string | null
          phone?: string
          team_size?: string | null
        }
        Relationships: []
      }
      do_not_call_entries: {
        Row: {
          created_at: string
          id: string
          phone_number: string
          reason: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_number: string
          reason?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_number?: string
          reason?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      ebook_subscribers: {
        Row: {
          created_at: string | null
          downloaded: boolean | null
          email: string
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          downloaded?: boolean | null
          email: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          downloaded?: boolean | null
          email?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      follow_up_sequences: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          content: string | null
          created_at: string
          delay_hours: number
          id: string
          scheduled_for: string | null
          sent_at: string | null
          sequence_type: string
          status: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string
          delay_hours?: number
          id?: string
          scheduled_for?: string | null
          sent_at?: string | null
          sequence_type: string
          status?: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string
          delay_hours?: number
          id?: string
          scheduled_for?: string | null
          sent_at?: string | null
          sequence_type?: string
          status?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_sequences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_sequences_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "campaign_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      google_integrations: {
        Row: {
          access_token: string
          availability_days: number[] | null
          availability_end: string | null
          availability_start: string | null
          buffer_time: number | null
          calendar_id: string | null
          calendar_name: string | null
          created_at: string | null
          default_duration: number | null
          email: string
          expires_at: string
          googleCalendarEnabled: boolean | null
          id: string
          refresh_token: string
          scopes: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          availability_days?: number[] | null
          availability_end?: string | null
          availability_start?: string | null
          buffer_time?: number | null
          calendar_id?: string | null
          calendar_name?: string | null
          created_at?: string | null
          default_duration?: number | null
          email: string
          expires_at: string
          googleCalendarEnabled?: boolean | null
          id?: string
          refresh_token: string
          scopes: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          availability_days?: number[] | null
          availability_end?: string | null
          availability_start?: string | null
          buffer_time?: number | null
          calendar_id?: string | null
          calendar_name?: string | null
          created_at?: string | null
          default_duration?: number | null
          email?: string
          expires_at?: string
          googleCalendarEnabled?: boolean | null
          id?: string
          refresh_token?: string
          scopes?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          integration_id: string
          message: string | null
          status: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          integration_id: string
          message?: string | null
          status: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          integration_id?: string
          message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          capabilities: string[]
          configuration: Json
          created_at: string
          credentials: Json
          display_name: string
          expires_at: string | null
          id: string
          integration_type: string
          is_active: boolean
          last_sync_at: string | null
          metadata: Json
          provider_name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capabilities?: string[]
          configuration?: Json
          created_at?: string
          credentials?: Json
          display_name: string
          expires_at?: string | null
          id?: string
          integration_type: string
          is_active?: boolean
          last_sync_at?: string | null
          metadata?: Json
          provider_name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capabilities?: string[]
          configuration?: Json
          created_at?: string
          credentials?: Json
          display_name?: string
          expires_at?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean
          last_sync_at?: string | null
          metadata?: Json
          provider_name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      live_coach_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          metadata: Json
          session_token: string
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          metadata?: Json
          session_token?: string
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          metadata?: Json
          session_token?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      microsoft_integrations: {
        Row: {
          access_token: string
          availability_days: number[] | null
          availability_end: string | null
          availability_start: string | null
          buffer_time: number | null
          calendar_id: string | null
          calendar_name: string | null
          created_at: string
          default_duration: number | null
          email: string
          expires_at: string
          id: string
          refresh_token: string | null
          scopes: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          availability_days?: number[] | null
          availability_end?: string | null
          availability_start?: string | null
          buffer_time?: number | null
          calendar_id?: string | null
          calendar_name?: string | null
          created_at?: string
          default_duration?: number | null
          email: string
          expires_at: string
          id?: string
          refresh_token?: string | null
          scopes: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          availability_days?: number[] | null
          availability_end?: string | null
          availability_start?: string | null
          buffer_time?: number | null
          calendar_id?: string | null
          calendar_name?: string | null
          created_at?: string
          default_duration?: number | null
          email?: string
          expires_at?: string
          id?: string
          refresh_token?: string | null
          scopes?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          code_verifier: string
          created_at: string | null
          expires_at: string
          id: string
          return_url: string
          state: string
          user_id: string | null
        }
        Insert: {
          code_verifier: string
          created_at?: string | null
          expires_at: string
          id?: string
          return_url: string
          state: string
          user_id?: string | null
        }
        Update: {
          code_verifier?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          return_url?: string
          state?: string
          user_id?: string | null
        }
        Relationships: []
      }
      onboarding_progress: {
        Row: {
          choices: Json
          completed_at: string | null
          created_at: string
          current_step: number
          updated_at: string
          user_id: string
        }
        Insert: {
          choices?: Json
          completed_at?: string | null
          created_at?: string
          current_step?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          choices?: Json
          completed_at?: string | null
          created_at?: string
          current_step?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          additional_info: string | null
          created_at: string
          id: string
          name: string
          size: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          additional_info?: string | null
          created_at?: string
          id?: string
          name: string
          size: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          additional_info?: string | null
          created_at?: string
          id?: string
          name?: string
          size?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_activities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          next_action: string | null
          occurred_at: string
          partner_id: string
          prospect_id: string
          summary: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          next_action?: string | null
          occurred_at?: string
          partner_id: string
          prospect_id: string
          summary: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          next_action?: string | null
          occurred_at?: string
          partner_id?: string
          prospect_id?: string
          summary?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_activities_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_activities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "partner_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_agreement_acceptances: {
        Row: {
          accepted_at: string
          agreement_id: string
          id: string
          ip_address: string | null
          partner_id: string
          user_agent: string | null
          version: string
        }
        Insert: {
          accepted_at?: string
          agreement_id: string
          id?: string
          ip_address?: string | null
          partner_id: string
          user_agent?: string | null
          version: string
        }
        Update: {
          accepted_at?: string
          agreement_id?: string
          id?: string
          ip_address?: string | null
          partner_id?: string
          user_agent?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_agreement_acceptances_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "partner_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_agreement_acceptances_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_agreements: {
        Row: {
          body: string
          created_at: string
          id: string
          published_at: string | null
          title: string
          version: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          published_at?: string | null
          title: string
          version: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          published_at?: string | null
          title?: string
          version?: string
        }
        Relationships: []
      }
      partner_attributions: {
        Row: {
          account_id: string
          agreement_version: string | null
          approved_at: string | null
          approved_by: string | null
          commission_type: string
          conversion_kind: string
          created_at: string
          eligibility_ends_at: string | null
          eligibility_starts_at: string | null
          holding_annual_days: number
          holding_monthly_days: number
          id: string
          match_evidence: Json
          method: string
          months_snapshot: number
          partner_id: string
          prospect_id: string | null
          rate_snapshot: number
          rate_version_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          agreement_version?: string | null
          approved_at?: string | null
          approved_by?: string | null
          commission_type?: string
          conversion_kind?: string
          created_at?: string
          eligibility_ends_at?: string | null
          eligibility_starts_at?: string | null
          holding_annual_days: number
          holding_monthly_days: number
          id?: string
          match_evidence?: Json
          method: string
          months_snapshot: number
          partner_id: string
          prospect_id?: string | null
          rate_snapshot: number
          rate_version_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          agreement_version?: string | null
          approved_at?: string | null
          approved_by?: string | null
          commission_type?: string
          conversion_kind?: string
          created_at?: string
          eligibility_ends_at?: string | null
          eligibility_starts_at?: string | null
          holding_annual_days?: number
          holding_monthly_days?: number
          id?: string
          match_evidence?: Json
          method?: string
          months_snapshot?: number
          partner_id?: string
          prospect_id?: string | null
          rate_snapshot?: number
          rate_version_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_attributions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_attributions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "partner_prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_attributions_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "partner_rate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string | null
          id: number
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: number
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: number
          reason?: string | null
        }
        Relationships: []
      }
      partner_commissions: {
        Row: {
          account_id: string
          amount_cents: number
          attribution_id: string
          billing_interval: string | null
          created_at: string
          created_by: string | null
          currency: string
          earn_after: string
          eligible_cents: number
          excluded_cents: number
          gross_line_cents: number
          id: string
          invoice_id: string | null
          invoice_line_id: string | null
          ledger_key: string
          occurred_at: string
          partner_id: string
          payout_id: string | null
          rate: number
          rate_version_id: string | null
          reason: string | null
          source_type: string
          status: string
          stripe_event_id: string | null
          stripe_object_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount_cents: number
          attribution_id: string
          billing_interval?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          earn_after: string
          eligible_cents: number
          excluded_cents?: number
          gross_line_cents?: number
          id?: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          ledger_key: string
          occurred_at: string
          partner_id: string
          payout_id?: string | null
          rate: number
          rate_version_id?: string | null
          reason?: string | null
          source_type: string
          status?: string
          stripe_event_id?: string | null
          stripe_object_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount_cents?: number
          attribution_id?: string
          billing_interval?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          earn_after?: string
          eligible_cents?: number
          excluded_cents?: number
          gross_line_cents?: number
          id?: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          ledger_key?: string
          occurred_at?: string
          partner_id?: string
          payout_id?: string | null
          rate?: number
          rate_version_id?: string | null
          reason?: string | null
          source_type?: string
          status?: string
          stripe_event_id?: string | null
          stripe_object_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_commissions_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "partner_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "partner_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_rate_version_id_fkey"
            columns: ["rate_version_id"]
            isOneToOne: false
            referencedRelation: "partner_rate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_demo_settings: {
        Row: {
          buffer_min: number
          calendar_id: string
          duration_min: number
          google_integration_id: string | null
          id: boolean
          min_notice_hours: number
          timezone: string
          updated_at: string
          window_days: number
          working_days: number[]
          working_end: string
          working_start: string
        }
        Insert: {
          buffer_min?: number
          calendar_id?: string
          duration_min?: number
          google_integration_id?: string | null
          id?: boolean
          min_notice_hours?: number
          timezone?: string
          updated_at?: string
          window_days?: number
          working_days?: number[]
          working_end?: string
          working_start?: string
        }
        Update: {
          buffer_min?: number
          calendar_id?: string
          duration_min?: number
          google_integration_id?: string | null
          id?: boolean
          min_notice_hours?: number
          timezone?: string
          updated_at?: string
          window_days?: number
          working_days?: number[]
          working_end?: string
          working_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_demo_settings_google_integration_id_fkey"
            columns: ["google_integration_id"]
            isOneToOne: false
            referencedRelation: "google_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_demos: {
        Row: {
          calendar_id: string
          created_at: string
          google_event_id: string | null
          hold_expires_at: string | null
          id: string
          partner_id: string
          prospect_id: string
          slot: unknown
          slot_end: string
          slot_start: string
          status: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          google_event_id?: string | null
          hold_expires_at?: string | null
          id?: string
          partner_id: string
          prospect_id: string
          slot?: unknown
          slot_end: string
          slot_start: string
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          google_event_id?: string | null
          hold_expires_at?: string | null
          id?: string
          partner_id?: string
          prospect_id?: string
          slot?: unknown
          slot_end?: string
          slot_start?: string
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_demos_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_demos_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "partner_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_house_accounts: {
        Row: {
          business_name: string | null
          created_at: string
          created_by: string | null
          domain: string | null
          email: string | null
          id: string
          norm_business: string | null
          norm_domain: string | null
          norm_email: string | null
          norm_phone: string | null
          note: string | null
          phone: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string | null
          email?: string | null
          id?: string
          norm_business?: string | null
          norm_domain?: string | null
          norm_email?: string | null
          norm_phone?: string | null
          note?: string | null
          phone?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string | null
          email?: string | null
          id?: string
          norm_business?: string | null
          norm_domain?: string | null
          norm_email?: string | null
          norm_phone?: string | null
          note?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      partner_materials: {
        Row: {
          created_at: string
          description: string | null
          file_path: string | null
          id: string
          is_published: boolean
          kind: string
          sort: number
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_path?: string | null
          id?: string
          is_published?: boolean
          kind: string
          sort?: number
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          file_path?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          sort?: number
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      partner_payouts: {
        Row: {
          approved_by: string | null
          carried_forward_cents: number
          created_at: string
          currency: string
          id: string
          method: string | null
          paid_at: string | null
          partner_id: string
          period: string
          recorded_by: string | null
          reference: string | null
          scheduled_for: string
          status: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          carried_forward_cents?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          paid_at?: string | null
          partner_id: string
          period: string
          recorded_by?: string | null
          reference?: string | null
          scheduled_for: string
          status?: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          carried_forward_cents?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          paid_at?: string | null
          partner_id?: string
          period?: string
          recorded_by?: string | null
          reference?: string | null
          scheduled_for?: string
          status?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_program_config: {
        Row: {
          activity_deadline_days: number
          approved_payout_methods: string[]
          default_assisted_rate: number
          default_closed_rate: number
          default_months: number
          excluded_line_kinds: string[]
          excluded_price_ids: string[]
          holding_annual_days: number
          holding_monthly_days: number
          id: boolean
          link_touch_days: number
          min_payout_cents: number
          payout_day: number
          protection_days: number
          updated_at: string
          volume_flag: Json
        }
        Insert: {
          activity_deadline_days?: number
          approved_payout_methods?: string[]
          default_assisted_rate?: number
          default_closed_rate?: number
          default_months?: number
          excluded_line_kinds?: string[]
          excluded_price_ids?: string[]
          holding_annual_days?: number
          holding_monthly_days?: number
          id?: boolean
          link_touch_days?: number
          min_payout_cents?: number
          payout_day?: number
          protection_days?: number
          updated_at?: string
          volume_flag?: Json
        }
        Update: {
          activity_deadline_days?: number
          approved_payout_methods?: string[]
          default_assisted_rate?: number
          default_closed_rate?: number
          default_months?: number
          excluded_line_kinds?: string[]
          excluded_price_ids?: string[]
          holding_annual_days?: number
          holding_monthly_days?: number
          id?: boolean
          link_touch_days?: number
          min_payout_cents?: number
          payout_day?: number
          protection_days?: number
          updated_at?: string
          volume_flag?: Json
        }
        Relationships: []
      }
      partner_prospects: {
        Row: {
          activity_deadline: string
          business_name: string
          city: string | null
          contact_name: string | null
          converted_account_id: string | null
          created_at: string
          email: string | null
          id: string
          industry: string | null
          industry_other: string | null
          last_contact_at: string | null
          lead_source: string | null
          location_label: string | null
          match_key_business: string | null
          next_follow_up_at: string | null
          norm_business: string | null
          norm_domain: string | null
          norm_email: string | null
          norm_phone: string | null
          notes: string | null
          partner_id: string
          phone: string | null
          postal_code: string | null
          protected_until: string
          protection_status: string
          purchasing_entity: string
          status: string
          street: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          activity_deadline?: string
          business_name: string
          city?: string | null
          contact_name?: string | null
          converted_account_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          industry?: string | null
          industry_other?: string | null
          last_contact_at?: string | null
          lead_source?: string | null
          location_label?: string | null
          match_key_business?: string | null
          next_follow_up_at?: string | null
          norm_business?: string | null
          norm_domain?: string | null
          norm_email?: string | null
          norm_phone?: string | null
          notes?: string | null
          partner_id: string
          phone?: string | null
          postal_code?: string | null
          protected_until?: string
          protection_status?: string
          purchasing_entity?: string
          status?: string
          street?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          activity_deadline?: string
          business_name?: string
          city?: string | null
          contact_name?: string | null
          converted_account_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          industry?: string | null
          industry_other?: string | null
          last_contact_at?: string | null
          lead_source?: string | null
          location_label?: string | null
          match_key_business?: string | null
          next_follow_up_at?: string | null
          norm_business?: string | null
          norm_domain?: string | null
          norm_email?: string | null
          norm_phone?: string | null
          notes?: string | null
          partner_id?: string
          phone?: string | null
          postal_code?: string | null
          protected_until?: string
          protection_status?: string
          purchasing_entity?: string
          status?: string
          street?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_prospects_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_rate_versions: {
        Row: {
          commission_type: string
          created_at: string
          created_by: string | null
          effective_from: string
          holding_annual_days: number
          holding_monthly_days: number
          id: string
          months: number
          partner_id: string
          rate: number
          reason: string | null
        }
        Insert: {
          commission_type: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          holding_annual_days?: number
          holding_monthly_days?: number
          id?: string
          months?: number
          partner_id: string
          rate: number
          reason?: string | null
        }
        Update: {
          commission_type?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          holding_annual_days?: number
          holding_monthly_days?: number
          id?: string
          months?: number
          partner_id?: string
          rate?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_rate_versions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_review_flags: {
        Row: {
          created_at: string
          details: Json
          id: string
          kind: string
          partner_id: string
          resolution: string | null
          resolved_by: string | null
          status: string
          subject_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          kind: string
          partner_id: string
          resolution?: string | null
          resolved_by?: string | null
          status?: string
          subject_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          partner_id?: string
          resolution?: string | null
          resolved_by?: string | null
          status?: string
          subject_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_review_flags_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          activated_at: string | null
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          invite_email: string
          invited_by: string | null
          payout_contact: string | null
          payout_method: string | null
          payout_method_approved_at: string | null
          payout_method_approved_by: string | null
          referral_code: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          invite_email: string
          invited_by?: string | null
          payout_contact?: string | null
          payout_method?: string | null
          payout_method_approved_at?: string | null
          payout_method_approved_by?: string | null
          referral_code: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          invite_email?: string
          invited_by?: string | null
          payout_contact?: string | null
          payout_method?: string | null
          payout_method_approved_at?: string | null
          payout_method_approved_by?: string | null
          referral_code?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      phone_verifications: {
        Row: {
          attempts: number | null
          created_at: string | null
          expires_at: string
          id: string
          phone_number: string
          updated_at: string | null
          verification_code_hash: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          expires_at?: string
          id?: string
          phone_number: string
          updated_at?: string | null
          verification_code_hash: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          expires_at?: string
          id?: string
          phone_number?: string
          updated_at?: string | null
          verification_code_hash?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      plan_features: {
        Row: {
          ai_insights: boolean
          api_access: boolean
          appointment_booking: boolean
          calendar_integration: boolean
          call_recording: boolean
          created_at: string
          crm_integration: boolean
          id: string
          plan_id: string
          retry_logic: boolean
          sms_followup: boolean
          updated_at: string
        }
        Insert: {
          ai_insights?: boolean
          api_access?: boolean
          appointment_booking?: boolean
          calendar_integration?: boolean
          call_recording?: boolean
          created_at?: string
          crm_integration?: boolean
          id?: string
          plan_id: string
          retry_logic?: boolean
          sms_followup?: boolean
          updated_at?: string
        }
        Update: {
          ai_insights?: boolean
          api_access?: boolean
          appointment_booking?: boolean
          calendar_integration?: boolean
          call_recording?: boolean
          created_at?: string
          crm_integration?: boolean
          id?: string
          plan_id?: string
          retry_logic?: boolean
          sms_followup?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string | null
          first_call_acknowledged_at: string | null
          full_name: string | null
          id: string
          industry: string | null
          marketing_consent: boolean | null
          marketing_consent_at: string | null
          phone: string | null
          terms_accepted_at: string | null
          updated_at: string
          use_case: string | null
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          first_call_acknowledged_at?: string | null
          full_name?: string | null
          id: string
          industry?: string | null
          marketing_consent?: boolean | null
          marketing_consent_at?: string | null
          phone?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          use_case?: string | null
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          first_call_acknowledged_at?: string | null
          full_name?: string | null
          id?: string
          industry?: string | null
          marketing_consent?: boolean | null
          marketing_consent_at?: string | null
          phone?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          use_case?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      push_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_token: string
          id: string
          last_seen_at: string
          platform: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_token: string
          id?: string
          last_seen_at?: string
          platform: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action_type: string
          count: number | null
          created_at: string | null
          id: string
          identifier: string
          updated_at: string | null
          window_start: string | null
        }
        Insert: {
          action_type: string
          count?: number | null
          created_at?: string | null
          id?: string
          identifier: string
          updated_at?: string | null
          window_start?: string | null
        }
        Update: {
          action_type?: string
          count?: number | null
          created_at?: string | null
          id?: string
          identifier?: string
          updated_at?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      referral_touches: {
        Row: {
          code: string
          created_at: string
          id: string
          ip_address: string | null
          landing_url: string | null
          partner_id: string
          source: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          ip_address?: string | null
          landing_url?: string | null
          partner_id: string
          source: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          landing_url?: string | null
          partner_id?: string
          source?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_touches_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          error: string | null
          processed_at: string | null
          received_at: string
          status: string
          stripe_event_id: string
          type: string
        }
        Insert: {
          error?: string | null
          processed_at?: string | null
          received_at?: string
          status?: string
          stripe_event_id: string
          type: string
        }
        Update: {
          error?: string | null
          processed_at?: string | null
          received_at?: string
          status?: string
          stripe_event_id?: string
          type?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          billing_interval: string | null
          created_at: string | null
          credits_allowance: number
          features: Json
          id: string
          is_active: boolean | null
          is_pay_as_you_go: boolean | null
          max_agents: number
          max_mobile_devices: number
          max_team_members: number
          minutes_allowance: number
          name: string
          number_rental_fee: number | null
          per_minute_rate: number | null
          price: number
          prod_id: string | null
          stripe_price_id: string | null
          updated_at: string | null
        }
        Insert: {
          billing_interval?: string | null
          created_at?: string | null
          credits_allowance?: number
          features?: Json
          id?: string
          is_active?: boolean | null
          is_pay_as_you_go?: boolean | null
          max_agents: number
          max_mobile_devices?: number
          max_team_members: number
          minutes_allowance: number
          name: string
          number_rental_fee?: number | null
          per_minute_rate?: number | null
          price: number
          prod_id?: string | null
          stripe_price_id?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_interval?: string | null
          created_at?: string | null
          credits_allowance?: number
          features?: Json
          id?: string
          is_active?: boolean | null
          is_pay_as_you_go?: boolean | null
          max_agents?: number
          max_mobile_devices?: number
          max_team_members?: number
          minutes_allowance?: number
          name?: string
          number_rental_fee?: number | null
          per_minute_rate?: number | null
          price?: number
          prod_id?: string | null
          stripe_price_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tcpa_consent_logs: {
        Row: {
          company: string | null
          consent_given: boolean
          consent_text: string
          created_at: string
          id: string
          ip_address: string | null
          name: string
          phone_number: string
          user_agent: string | null
        }
        Insert: {
          company?: string | null
          consent_given?: boolean
          consent_text: string
          created_at?: string
          id?: string
          ip_address?: string | null
          name: string
          phone_number: string
          user_agent?: string | null
        }
        Update: {
          company?: string | null
          consent_given?: boolean
          consent_text?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          name?: string
          phone_number?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          owner_user_id: string
          team_member_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          owner_user_id: string
          team_member_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          owner_user_id?: string
          team_member_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          accepted_at: string | null
          can_listen: boolean
          can_transfer: boolean
          created_at: string
          display_name: string | null
          email: string
          id: string
          invited_at: string
          member_user_id: string | null
          owner_user_id: string
          phone_number: string | null
          receives_notifications: boolean
          revoked_at: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          can_listen?: boolean
          can_transfer?: boolean
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          invited_at?: string
          member_user_id?: string | null
          owner_user_id: string
          phone_number?: string | null
          receives_notifications?: boolean
          revoked_at?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          can_listen?: boolean
          can_transfer?: boolean
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          invited_at?: string
          member_user_id?: string | null
          owner_user_id?: string
          phone_number?: string | null
          receives_notifications?: boolean
          revoked_at?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tool_call_logs: {
        Row: {
          agent_id: string
          id: string
          parameters: Json
          result: Json | null
          status: string
          timestamp: string
          tool_name: string
        }
        Insert: {
          agent_id: string
          id?: string
          parameters: Json
          result?: Json | null
          status: string
          timestamp?: string
          tool_name: string
        }
        Update: {
          agent_id?: string
          id?: string
          parameters?: Json
          result?: Json | null
          status?: string
          timestamp?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_agent"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      try_ringster_call_rate_limits: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          phone_number: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          phone_number?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          phone_number?: string | null
        }
        Relationships: []
      }
      usage_summary: {
        Row: {
          created_at: string | null
          id: string
          month: number
          total_calls: number | null
          total_minutes: number | null
          total_transfers: number | null
          user_id: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          month: number
          total_calls?: number | null
          total_minutes?: number | null
          total_transfers?: number | null
          user_id?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          month?: number
          total_calls?: number | null
          total_minutes?: number | null
          total_transfers?: number | null
          user_id?: string | null
          year?: number
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          add_on_credits: number
          add_on_credits_used: number
          created_at: string
          credits_used: number
          id: string
          plan_credits: number
          reset_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          add_on_credits?: number
          add_on_credits_used?: number
          created_at?: string
          credits_used?: number
          id?: string
          plan_credits?: number
          reset_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          add_on_credits?: number
          add_on_credits_used?: number
          created_at?: string
          credits_used?: number
          id?: string
          plan_credits?: number
          reset_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vapi_global_config: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_partner_agreement: {
        Args: { p_agreement_id: string; p_user_agent?: string }
        Returns: string
      }
      add_credits: {
        Args: {
          p_credit_type?: string
          p_credits_amount: number
          p_description?: string
          p_user_id: string
        }
        Returns: boolean
      }
      admin_add_commission_adjustment: {
        Args: {
          p_amount_cents: number
          p_attribution: string
          p_reason: string
        }
        Returns: string
      }
      admin_build_payouts: { Args: { p_period: string }; Returns: number }
      admin_create_manual_attribution: {
        Args: {
          p_account_email: string
          p_partner: string
          p_reason: string
          p_type: string
        }
        Returns: string
      }
      admin_invite_partner: {
        Args: {
          p_assisted_rate?: number
          p_closed_rate?: number
          p_display_name: string
          p_email: string
        }
        Returns: string
      }
      admin_resolve_partner_flag: {
        Args: { p_flag_id: string; p_resolution: string; p_status: string }
        Returns: undefined
      }
      admin_review_attribution: {
        Args: {
          p_action: string
          p_id: string
          p_reason: string
          p_type: string
        }
        Returns: undefined
      }
      admin_set_demo_outcome: {
        Args: { p_demo: string; p_status: string }
        Returns: undefined
      }
      admin_set_partner_payout: {
        Args: {
          p_contact: string
          p_country: string
          p_method: string
          p_partner_id: string
          p_reason?: string
        }
        Returns: undefined
      }
      admin_set_payout_status: {
        Args: { p_payout: string; p_reference: string; p_status: string }
        Returns: undefined
      }
      admin_set_prospect_protection: {
        Args: {
          p_action: string
          p_new_partner: string
          p_prospect_id: string
          p_reason: string
        }
        Returns: undefined
      }
      booking_tstzrange: {
        Args: { duration_min: number; start_time: string }
        Returns: unknown
      }
      claim_partner_attribution: {
        Args: {
          p_account: string
          p_paid_at: string
          p_prior_paid: boolean
          p_stripe_customer: string
        }
        Returns: Json
      }
      cleanup_expired_oauth_states: { Args: never; Returns: undefined }
      create_phone_verification: {
        Args: { p_code: string; p_phone_number: string; p_ttl_minutes?: number }
        Returns: string
      }
      current_partner_id: { Args: never; Returns: string }
      deduct_credits: {
        Args: {
          p_call_log_id?: string
          p_credits_amount: number
          p_description?: string
          p_user_id: string
        }
        Returns: boolean
      }
      finalize_call: {
        Args: {
          p_agent_id: string
          p_duration_seconds: number
          p_ended_at?: string
          p_from_number?: string
          p_recording_url?: string
          p_started_at?: string
          p_to_number?: string
          p_transcript_url?: string
          p_user_id: string
          p_vapi_call_id: string
        }
        Returns: string
      }
      get_my_team_access: {
        Args: never
        Returns: {
          can_listen: boolean
          can_transfer: boolean
          is_owner: boolean
          receives_notifications: boolean
          role: string
        }[]
      }
      handle_subscription_update: {
        Args: {
          new_period_end: string
          new_period_start: string
          new_plan_id: string
          new_status: string
          user_id: string
        }
        Returns: undefined
      }
      has_live_coach_access: { Args: { p_user_id: string }; Returns: Json }
      has_role: {
        Args: { role_name: string; user_id: string }
        Returns: boolean
      }
      has_unused_addon_credits: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_partner_admin: { Args: { _uid: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      migrate_google_integrations: { Args: never; Returns: undefined }
      my_partner_access: { Args: never; Returns: Json }
      partner_account_owner: { Args: { p_user: string }; Returns: string }
      partner_active_attribution: {
        Args: { p_account: string; p_at: string }
        Returns: {
          account_id: string
          agreement_version: string | null
          approved_at: string | null
          approved_by: string | null
          commission_type: string
          conversion_kind: string
          created_at: string
          eligibility_ends_at: string | null
          eligibility_starts_at: string | null
          holding_annual_days: number
          holding_monthly_days: number
          id: string
          match_evidence: Json
          method: string
          months_snapshot: number
          partner_id: string
          prospect_id: string | null
          rate_snapshot: number
          rate_version_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "partner_attributions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      partner_earn_due: { Args: never; Returns: number }
      partner_insert_attribution: {
        Args: {
          p_account: string
          p_approved_by: string
          p_evidence: Json
          p_kind: string
          p_method: string
          p_paid_at: string
          p_partner: string
          p_prospect: string
          p_status: string
          p_type: string
        }
        Returns: string
      }
      partner_is_self_referral: {
        Args: {
          p_account: string
          p_partner: string
          p_stripe_customer: string
        }
        Returns: string
      }
      partner_rate_for: {
        Args: { p_partner: string; p_type: string }
        Returns: {
          commission_type: string
          created_at: string
          created_by: string | null
          effective_from: string
          holding_annual_days: number
          holding_monthly_days: number
          id: string
          months: number
          partner_id: string
          rate: number
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "partner_rate_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      partner_report: {
        Args: { p_partner?: string }
        Returns: {
          active_customers: number
          business_name: string
          churned_customers: number
          collected_revenue_cents: number
          commission_ratio: number
          credited_customers: number
          currency: string
          net_commission_cents: number
          partner_id: string
          pending_commission_cents: number
          retention_rate: number
        }[]
      }
      partner_report_monthly: {
        Args: { p_months?: number; p_partner?: string }
        Returns: {
          collected_revenue_cents: number
          commission_cents: number
          month: string
          new_customers: number
        }[]
      }
      partner_sweep_protection: { Args: never; Returns: undefined }
      pn_business: { Args: { v: string }; Returns: string }
      pn_compact: { Args: { v: string }; Returns: string }
      pn_domain: { Args: { v: string }; Returns: string }
      pn_email: { Args: { v: string }; Returns: string }
      pn_phone: { Args: { v: string }; Returns: string }
      process_campaign_contacts: { Args: never; Returns: undefined }
      record_partner_commission_line: {
        Args: {
          p_account: string
          p_currency: string
          p_event: string
          p_excluded: number
          p_gross: number
          p_interval: string
          p_invoice: string
          p_line: string
          p_occurred: string
        }
        Returns: string
      }
      record_partner_commission_reversal: {
        Args: {
          p_event: string
          p_invoice: string
          p_ledger_key: string
          p_object: string
          p_occurred: string
          p_ratio: number
          p_source: string
        }
        Returns: string
      }
      record_referral_touch: {
        Args: {
          p_code: string
          p_landing_url: string
          p_source: string
          p_user_agent: string
        }
        Returns: Json
      }
      register_partner_prospect: { Args: { p: Json }; Returns: Json }
      reset_monthly_credits: { Args: { p_user_id: string }; Returns: boolean }
      sync_user_subscription: {
        Args: { p_plan_id?: string; p_user_id: string }
        Returns: undefined
      }
      team_member_has_access: {
        Args: { _cap?: string; _member: string; _owner: string }
        Returns: boolean
      }
      update_minutes_used: {
        Args: { p_minutes: number; p_user_id: string }
        Returns: undefined
      }
      verify_phone_code: {
        Args: { p_code: string; p_phone_number: string }
        Returns: {
          status: string
          verification_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin" | "partner"
      team_member_role: "owner" | "admin" | "member"
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
    Enums: {
      app_role: ["admin", "user", "super_admin", "partner"],
      team_member_role: ["owner", "admin", "member"],
    },
  },
} as const
