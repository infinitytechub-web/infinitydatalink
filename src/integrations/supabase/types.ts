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
      admin_sessions: {
        Row: {
          device: string | null
          ended_at: string | null
          id: string
          ip_address: string | null
          last_seen_at: string
          started_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          started_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          started_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_step_up_sessions: {
        Row: {
          aal: string | null
          created_at: string
          expires_at: string
          id: string
          ip: string | null
          last_used_at: string | null
          method: string
          revoked_at: string | null
          token_hash: string
          updated_at: string
          use_count: number
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aal?: string | null
          created_at?: string
          expires_at: string
          id?: string
          ip?: string | null
          last_used_at?: string | null
          method: string
          revoked_at?: string | null
          token_hash: string
          updated_at?: string
          use_count?: number
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aal?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip?: string | null
          last_used_at?: string | null
          method?: string
          revoked_at?: string | null
          token_hash?: string
          updated_at?: string
          use_count?: number
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_role: string | null
          created_at: string
          id: string
          meta: Json
          target: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          meta?: Json
          target?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          meta?: Json
          target?: string | null
        }
        Relationships: []
      }
      balance_adjustments: {
        Row: {
          amount: number
          approved_by: string | null
          created_at: string
          direction: Database["public"]["Enums"]["adjustment_direction"]
          id: string
          reason: string
          ref: string
          reference_txn_id: string | null
          savings_account_id: string
          txn_id: string | null
        }
        Insert: {
          amount: number
          approved_by?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["adjustment_direction"]
          id?: string
          reason: string
          ref?: string
          reference_txn_id?: string | null
          savings_account_id: string
          txn_id?: string | null
        }
        Update: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["adjustment_direction"]
          id?: string
          reason?: string
          ref?: string
          reference_txn_id?: string | null
          savings_account_id?: string
          txn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "balance_adjustments_savings_account_id_fkey"
            columns: ["savings_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_settings: {
        Row: {
          accent_color: string
          app_name: string
          email_footer_html: string | null
          email_from_name: string | null
          email_header_html: string | null
          email_reply_to: string | null
          favicon_path: string | null
          favicon_version: number
          footer_html: string | null
          id: number
          login_hero_url: string | null
          login_tagline: string | null
          logo_path: string | null
          logo_version: number
          org_address: string | null
          org_legal_name: string | null
          org_registration_no: string | null
          primary_color: string
          secondary_color: string
          support_email: string | null
          support_phone: string | null
          tagline: string | null
          touch_icon_path: string | null
          touch_icon_version: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accent_color?: string
          app_name?: string
          email_footer_html?: string | null
          email_from_name?: string | null
          email_header_html?: string | null
          email_reply_to?: string | null
          favicon_path?: string | null
          favicon_version?: number
          footer_html?: string | null
          id?: number
          login_hero_url?: string | null
          login_tagline?: string | null
          logo_path?: string | null
          logo_version?: number
          org_address?: string | null
          org_legal_name?: string | null
          org_registration_no?: string | null
          primary_color?: string
          secondary_color?: string
          support_email?: string | null
          support_phone?: string | null
          tagline?: string | null
          touch_icon_path?: string | null
          touch_icon_version?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accent_color?: string
          app_name?: string
          email_footer_html?: string | null
          email_from_name?: string | null
          email_header_html?: string | null
          email_reply_to?: string | null
          favicon_path?: string | null
          favicon_version?: number
          footer_html?: string | null
          id?: number
          login_hero_url?: string | null
          login_tagline?: string | null
          logo_path?: string | null
          logo_version?: number
          org_address?: string | null
          org_legal_name?: string | null
          org_registration_no?: string | null
          primary_color?: string
          secondary_color?: string
          support_email?: string | null
          support_phone?: string | null
          tagline?: string | null
          touch_icon_path?: string | null
          touch_icon_version?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      change_sla_settings: {
        Row: {
          breach_after_hours: number
          channels: string[]
          created_at: string
          enabled: boolean
          escalate_roles: string[]
          id: boolean
          notify_requester: boolean
          notify_roles: string[]
          repeat_hours: number
          updated_at: string
          updated_by: string | null
          warn_after_hours: number
        }
        Insert: {
          breach_after_hours?: number
          channels?: string[]
          created_at?: string
          enabled?: boolean
          escalate_roles?: string[]
          id?: boolean
          notify_requester?: boolean
          notify_roles?: string[]
          repeat_hours?: number
          updated_at?: string
          updated_by?: string | null
          warn_after_hours?: number
        }
        Update: {
          breach_after_hours?: number
          channels?: string[]
          created_at?: string
          enabled?: boolean
          escalate_roles?: string[]
          id?: boolean
          notify_requester?: boolean
          notify_roles?: string[]
          repeat_hours?: number
          updated_at?: string
          updated_by?: string | null
          warn_after_hours?: number
        }
        Relationships: []
      }
      cron_job_runs: {
        Row: {
          attempt: number
          caller: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          job: string
          metrics: Json
          run_key: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt?: number
          caller?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job: string
          metrics?: Json
          run_key: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          caller?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job?: string
          metrics?: Json
          run_key?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      dividend_runs: {
        Row: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          executed_at: string | null
          executed_by: string | null
          id: string
          members_paid: number
          note: string | null
          per_unit_amount: number
          period_end: string
          period_start: string
          product_id: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          total_paid: number
          units_paid: number
          updated_at: string
        }
        Insert: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          members_paid?: number
          note?: string | null
          per_unit_amount: number
          period_end: string
          period_start: string
          product_id: string
          ref: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          total_paid?: number
          units_paid?: number
          updated_at?: string
        }
        Update: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          members_paid?: number
          note?: string | null
          per_unit_amount?: number
          period_end?: string
          period_start?: string
          product_id?: string
          ref?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          total_paid?: number
          units_paid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dividend_runs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "share_products"
            referencedColumns: ["id"]
          },
        ]
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
      entities: {
        Row: {
          address_line: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          digital_address: string | null
          id: string
          kyc_notes: string | null
          name: string
          parent_entity_id: string | null
          region: string | null
          registration_no: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tax_id: string | null
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          digital_address?: string | null
          id?: string
          kyc_notes?: string | null
          name: string
          parent_entity_id?: string | null
          region?: string | null
          registration_no?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tax_id?: string | null
          type: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          digital_address?: string | null
          id?: string
          kyc_notes?: string | null
          name?: string
          parent_entity_id?: string | null
          region?: string | null
          registration_no?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tax_id?: string | null
          type?: Database["public"]["Enums"]["entity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_documents: {
        Row: {
          created_at: string
          doc_type: string
          entity_id: string
          id: string
          mime_type: string | null
          original_name: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type: string
          entity_id: string
          id?: string
          mime_type?: string | null
          original_name?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          entity_id?: string
          id?: string
          mime_type?: string | null
          original_name?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_documents_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_memberships: {
        Row: {
          entity_id: string
          id: string
          joined_at: string
          profile_id: string
          role: Database["public"]["Enums"]["entity_role"]
          status: string
        }
        Insert: {
          entity_id: string
          id?: string
          joined_at?: string
          profile_id: string
          role?: Database["public"]["Enums"]["entity_role"]
          status?: string
        }
        Update: {
          entity_id?: string
          id?: string
          joined_at?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["entity_role"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_memberships_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          label: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category_code: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          incurred_on: string
          notes: string | null
          paid_on: string | null
          paid_txn_id: string | null
          payment_channel: string | null
          ref: string
          reference: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          vendor: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          category_code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          incurred_on?: string
          notes?: string | null
          paid_on?: string | null
          paid_txn_id?: string | null
          payment_channel?: string | null
          ref?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          vendor: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          category_code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          incurred_on?: string
          notes?: string | null
          paid_on?: string | null
          paid_txn_id?: string | null
          payment_channel?: string | null
          ref?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      fixed_deposit_products: {
        Row: {
          code: string
          created_at: string
          description: string | null
          early_break_penalty_pct: number
          id: string
          is_active: boolean
          max_amount: number | null
          min_amount: number
          name: string
          rate_annual: number
          sort_order: number
          term_months: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          early_break_penalty_pct?: number
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number
          name: string
          rate_annual: number
          sort_order?: number
          term_months: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          early_break_penalty_pct?: number
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number
          name?: string
          rate_annual?: number
          sort_order?: number
          term_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      fixed_deposits: {
        Row: {
          break_reason: string | null
          broken_at: string | null
          close_txn_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          interest_expected: number
          interest_paid: number
          maturity_date: string
          open_txn_id: string | null
          penalty_amount: number
          principal: number
          product_id: string
          rate_annual: number
          ref: string
          rollover: string
          source_account_id: string
          start_date: string
          status: Database["public"]["Enums"]["fixed_deposit_status"]
          term_months: number
          updated_at: string
          user_id: string
        }
        Insert: {
          break_reason?: string | null
          broken_at?: string | null
          close_txn_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          interest_expected?: number
          interest_paid?: number
          maturity_date: string
          open_txn_id?: string | null
          penalty_amount?: number
          principal: number
          product_id: string
          rate_annual: number
          ref: string
          rollover?: string
          source_account_id: string
          start_date?: string
          status?: Database["public"]["Enums"]["fixed_deposit_status"]
          term_months: number
          updated_at?: string
          user_id: string
        }
        Update: {
          break_reason?: string | null
          broken_at?: string | null
          close_txn_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          interest_expected?: number
          interest_paid?: number
          maturity_date?: string
          open_txn_id?: string | null
          penalty_amount?: number
          principal?: number
          product_id?: string
          rate_annual?: number
          ref?: string
          rollover?: string
          source_account_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["fixed_deposit_status"]
          term_months?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_deposits_close_txn_id_fkey"
            columns: ["close_txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposits_open_txn_id_fkey"
            columns: ["open_txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposits_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fixed_deposit_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposits_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rate_history: {
        Row: {
          base: string
          created_at: string
          quote: string
          rate: number
          rate_date: string
          source: string
        }
        Insert: {
          base: string
          created_at?: string
          quote: string
          rate: number
          rate_date: string
          source?: string
        }
        Update: {
          base?: string
          created_at?: string
          quote?: string
          rate?: number
          rate_date?: string
          source?: string
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          base: string
          fetched_at: string
          quote: string
          rate: number
          source: string
        }
        Insert: {
          base: string
          fetched_at?: string
          quote: string
          rate: number
          source?: string
        }
        Update: {
          base?: string
          fetched_at?: string
          quote?: string
          rate?: number
          source?: string
        }
        Relationships: []
      }
      group_pot_contributions: {
        Row: {
          amount: number
          created_at: string
          cycle: number
          id: string
          note: string | null
          pot_id: string
          profile_id: string
          savings_account_id: string | null
          txn_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          cycle?: number
          id?: string
          note?: string | null
          pot_id: string
          profile_id: string
          savings_account_id?: string | null
          txn_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          cycle?: number
          id?: string
          note?: string | null
          pot_id?: string
          profile_id?: string
          savings_account_id?: string | null
          txn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_pot_contributions_pot_id_fkey"
            columns: ["pot_id"]
            isOneToOne: false
            referencedRelation: "group_pots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_pot_contributions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_pot_contributions_savings_account_id_fkey"
            columns: ["savings_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_pot_contributions_txn_id_fkey"
            columns: ["txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      group_pot_members: {
        Row: {
          id: string
          joined_at: string
          payout_position: number
          pot_id: string
          profile_id: string
          status: string
        }
        Insert: {
          id?: string
          joined_at?: string
          payout_position?: number
          pot_id: string
          profile_id: string
          status?: string
        }
        Update: {
          id?: string
          joined_at?: string
          payout_position?: number
          pot_id?: string
          profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_pot_members_pot_id_fkey"
            columns: ["pot_id"]
            isOneToOne: false
            referencedRelation: "group_pots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_pot_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_pot_payouts: {
        Row: {
          amount: number
          created_at: string
          cycle: number
          id: string
          note: string | null
          paid_at: string | null
          paid_by: string | null
          pot_id: string
          profile_id: string
          savings_account_id: string | null
          status: Database["public"]["Enums"]["pot_payout_status"]
          txn_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          cycle: number
          id?: string
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          pot_id: string
          profile_id: string
          savings_account_id?: string | null
          status?: Database["public"]["Enums"]["pot_payout_status"]
          txn_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          cycle?: number
          id?: string
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          pot_id?: string
          profile_id?: string
          savings_account_id?: string | null
          status?: Database["public"]["Enums"]["pot_payout_status"]
          txn_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_pot_payouts_pot_id_fkey"
            columns: ["pot_id"]
            isOneToOne: false
            referencedRelation: "group_pots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_pot_payouts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_pot_payouts_savings_account_id_fkey"
            columns: ["savings_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_pot_payouts_txn_id_fkey"
            columns: ["txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      group_pots: {
        Row: {
          balance: number
          contribution_amount: number
          created_at: string
          created_by: string | null
          current_cycle: number
          description: string | null
          entity_id: string
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          balance?: number
          contribution_amount: number
          created_at?: string
          created_by?: string | null
          current_cycle?: number
          description?: string | null
          entity_id: string
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          balance?: number
          contribution_amount?: number
          created_at?: string
          created_by?: string | null
          current_cycle?: number
          description?: string | null
          entity_id?: string
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_pots_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_documents: {
        Row: {
          created_at: string
          doc_type: Database["public"]["Enums"]["kyc_doc_type"]
          id: string
          member_id: string
          mime_type: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number
          status: Database["public"]["Enums"]["kyc_doc_status"]
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          doc_type: Database["public"]["Enums"]["kyc_doc_type"]
          id?: string
          member_id: string
          mime_type: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes: number
          status?: Database["public"]["Enums"]["kyc_doc_status"]
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["kyc_doc_type"]
          id?: string
          member_id?: string
          mime_type?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number
          status?: Database["public"]["Enums"]["kyc_doc_status"]
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_documents_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_notifications: {
        Row: {
          channel: Database["public"]["Enums"]["kyc_notification_channel"]
          created_at: string
          decision: string
          error: string | null
          id: string
          member_id: string
          message_id: string | null
          recipient: string
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["kyc_notification_channel"]
          created_at?: string
          decision: string
          error?: string | null
          id?: string
          member_id: string
          message_id?: string | null
          recipient: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["kyc_notification_channel"]
          created_at?: string
          decision?: string
          error?: string | null
          id?: string
          member_id?: string
          message_id?: string | null
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_restore_acknowledgments: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          document_types: string[]
          documents_restored: number
          id: string
          member_id: string
          reason: string | null
          restored_at: string
          restored_by_email: string | null
          restored_by_role: string | null
          restored_kyc: string | null
          vault_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          document_types?: string[]
          documents_restored?: number
          id?: string
          member_id: string
          reason?: string | null
          restored_at?: string
          restored_by_email?: string | null
          restored_by_role?: string | null
          restored_kyc?: string | null
          vault_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          document_types?: string[]
          documents_restored?: number
          id?: string
          member_id?: string
          reason?: string | null
          restored_at?: string
          restored_by_email?: string | null
          restored_by_role?: string | null
          restored_kyc?: string | null
          vault_id?: string | null
        }
        Relationships: []
      }
      kyc_resubmission_settings: {
        Row: {
          auto_flag_enabled: boolean
          auto_flag_min_severity: string
          created_at: string
          deadline_days: number
          enforce_deadline: boolean
          id: boolean
          low_attempts_threshold: number
          max_attempts: number
          reminder_enabled: boolean
          reminder_lead_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_flag_enabled?: boolean
          auto_flag_min_severity?: string
          created_at?: string
          deadline_days?: number
          enforce_deadline?: boolean
          id?: boolean
          low_attempts_threshold?: number
          max_attempts?: number
          reminder_enabled?: boolean
          reminder_lead_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_flag_enabled?: boolean
          auto_flag_min_severity?: string
          created_at?: string
          deadline_days?: number
          enforce_deadline?: boolean
          id?: boolean
          low_attempts_threshold?: number
          max_attempts?: number
          reminder_enabled?: boolean
          reminder_lead_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_resubmission_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_vault_retention: {
        Row: {
          auto_purge_enabled: boolean
          created_at: string
          id: number
          last_purge_actor: string | null
          last_purge_at: string | null
          last_purge_documents: number | null
          last_purge_entries: number | null
          legal_hold_days: number
          retention_years: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_purge_enabled?: boolean
          created_at?: string
          id?: number
          last_purge_actor?: string | null
          last_purge_at?: string | null
          last_purge_documents?: number | null
          last_purge_entries?: number | null
          legal_hold_days?: number
          retention_years?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_purge_enabled?: boolean
          created_at?: string
          id?: number
          last_purge_actor?: string | null
          last_purge_at?: string | null
          last_purge_documents?: number | null
          last_purge_entries?: number | null
          legal_hold_days?: number
          retention_years?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      loan_collateral: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          description: string
          estimated_value: number
          id: string
          kind: string
          loan_id: string
          reference_no: string | null
          release_note: string | null
          released_at: string | null
          released_by: string | null
          savings_hold_id: string | null
          status: Database["public"]["Enums"]["collateral_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          estimated_value: number
          id?: string
          kind: string
          loan_id: string
          reference_no?: string | null
          release_note?: string | null
          released_at?: string | null
          released_by?: string | null
          savings_hold_id?: string | null
          status?: Database["public"]["Enums"]["collateral_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          estimated_value?: number
          id?: string
          kind?: string
          loan_id?: string
          reference_no?: string | null
          release_note?: string | null
          released_at?: string | null
          released_by?: string | null
          savings_hold_id?: string | null
          status?: Database["public"]["Enums"]["collateral_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_collateral_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_collateral_savings_hold_id_fkey"
            columns: ["savings_hold_id"]
            isOneToOne: false
            referencedRelation: "savings_holds"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_guarantors: {
        Row: {
          consent: Database["public"]["Enums"]["guarantor_consent_status"]
          consent_at: string | null
          consent_note: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          guaranteed_amount: number
          id: string
          loan_id: string
          member_id: string | null
          phone: string | null
          relationship: string | null
          updated_at: string
        }
        Insert: {
          consent?: Database["public"]["Enums"]["guarantor_consent_status"]
          consent_at?: string | null
          consent_note?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          guaranteed_amount: number
          id?: string
          loan_id: string
          member_id?: string | null
          phone?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          consent?: Database["public"]["Enums"]["guarantor_consent_status"]
          consent_at?: string | null
          consent_note?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          guaranteed_amount?: number
          id?: string
          loan_id?: string
          member_id?: string | null
          phone?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_guarantors_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_guarantors_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_penalties: {
        Row: {
          amount: number
          created_at: string
          days_late: number
          id: string
          loan_id: string
          period_month: string
          reason: string
          repayment_id: string | null
          updated_at: string
          waive_note: string | null
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          days_late?: number
          id?: string
          loan_id: string
          period_month: string
          reason?: string
          repayment_id?: string | null
          updated_at?: string
          waive_note?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          days_late?: number
          id?: string
          loan_id?: string
          period_month?: string
          reason?: string
          repayment_id?: string | null
          updated_at?: string
          waive_note?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_penalties_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_penalties_repayment_id_fkey"
            columns: ["repayment_id"]
            isOneToOne: false
            referencedRelation: "loan_repayments"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_products: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          interest_rate: number
          late_fee_grace_days: number
          late_fee_pct: number
          max_amount: number
          max_multiple_of_savings: number
          max_open_loans: number
          max_term_months: number
          min_amount: number
          min_guarantors: number
          min_savings_balance: number
          min_term_months: number
          name: string
          processing_fee_pct: number
          requires_collateral: boolean
          requires_guarantor: boolean
          requires_verified_kyc: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          interest_rate?: number
          late_fee_grace_days?: number
          late_fee_pct?: number
          max_amount?: number
          max_multiple_of_savings?: number
          max_open_loans?: number
          max_term_months?: number
          min_amount?: number
          min_guarantors?: number
          min_savings_balance?: number
          min_term_months?: number
          name: string
          processing_fee_pct?: number
          requires_collateral?: boolean
          requires_guarantor?: boolean
          requires_verified_kyc?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          interest_rate?: number
          late_fee_grace_days?: number
          late_fee_pct?: number
          max_amount?: number
          max_multiple_of_savings?: number
          max_open_loans?: number
          max_term_months?: number
          min_amount?: number
          min_guarantors?: number
          min_savings_balance?: number
          min_term_months?: number
          name?: string
          processing_fee_pct?: number
          requires_collateral?: boolean
          requires_guarantor?: boolean
          requires_verified_kyc?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      loan_reminder_log: {
        Row: {
          created_at: string
          email_status: string
          id: string
          repayment_id: string
          stage: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_status?: string
          id?: string
          repayment_id: string
          stage: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_status?: string
          id?: string
          repayment_id?: string
          stage?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_reminder_log_repayment_id_fkey"
            columns: ["repayment_id"]
            isOneToOne: false
            referencedRelation: "loan_repayments"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_repayments: {
        Row: {
          created_at: string
          due_date: string
          due_notified_at: string | null
          id: string
          installment_no: number
          interest_due: number
          loan_id: string
          overdue_notified_at: string | null
          paid_amount: number
          paid_at: string | null
          principal_due: number
          status: string
          total_due: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          due_notified_at?: string | null
          id?: string
          installment_no: number
          interest_due: number
          loan_id: string
          overdue_notified_at?: string | null
          paid_amount?: number
          paid_at?: string | null
          principal_due: number
          status?: string
          total_due: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          due_notified_at?: string | null
          id?: string
          installment_no?: number
          interest_due?: number
          loan_id?: string
          overdue_notified_at?: string | null
          paid_amount?: number
          paid_at?: string | null
          principal_due?: number
          status?: string
          total_due?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_restructures: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_email: string | null
          decision_note: string | null
          grace_months: number | null
          id: string
          kind: Database["public"]["Enums"]["loan_restructure_kind"]
          loan_id: string
          new_interest_rate: number | null
          new_term_months: number | null
          request_note: string
          requested_at: string
          requested_by: string
          requested_by_email: string | null
          status: Database["public"]["Enums"]["loan_restructure_status"]
          updated_at: string
          write_off_amount: number | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_email?: string | null
          decision_note?: string | null
          grace_months?: number | null
          id?: string
          kind: Database["public"]["Enums"]["loan_restructure_kind"]
          loan_id: string
          new_interest_rate?: number | null
          new_term_months?: number | null
          request_note: string
          requested_at?: string
          requested_by: string
          requested_by_email?: string | null
          status?: Database["public"]["Enums"]["loan_restructure_status"]
          updated_at?: string
          write_off_amount?: number | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_email?: string | null
          decision_note?: string | null
          grace_months?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["loan_restructure_kind"]
          loan_id?: string
          new_interest_rate?: number | null
          new_term_months?: number | null
          request_note?: string
          requested_at?: string
          requested_by?: string
          requested_by_email?: string | null
          status?: Database["public"]["Enums"]["loan_restructure_status"]
          updated_at?: string
          write_off_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_restructures_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_settlement_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_email: string | null
          decision_note: string | null
          id: string
          loan_id: string
          member_note: string | null
          quote: Json
          quoted_total: number
          requested_at: string
          settle_on: string
          status: Database["public"]["Enums"]["settlement_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_email?: string | null
          decision_note?: string | null
          id?: string
          loan_id: string
          member_note?: string | null
          quote?: Json
          quoted_total: number
          requested_at?: string
          settle_on: string
          status?: Database["public"]["Enums"]["settlement_request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_email?: string | null
          decision_note?: string | null
          id?: string
          loan_id?: string
          member_note?: string | null
          quote?: Json
          quoted_total?: number
          requested_at?: string
          settle_on?: string
          status?: Database["public"]["Enums"]["settlement_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_settlement_requests_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount: number
          arrears_amount: number
          arrears_bucket: string
          arrears_refreshed_at: string | null
          created_at: string
          days_past_due: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          disbursed_at: string | null
          disbursed_by: string | null
          disbursement_account_id: string | null
          disbursement_channel: string | null
          disbursement_note: string | null
          disbursement_reference: string | null
          disbursement_requested_at: string | null
          disbursement_requested_by: string | null
          disbursement_status: string
          first_payment_at: string | null
          id: string
          interest_rate: number
          interest_start_at: string | null
          maturity_at: string | null
          monthly_payment: number | null
          outstanding_principal: number
          penalty_accrued: number
          penalty_paid: number
          product: string
          product_id: string | null
          purpose: string | null
          ref: string
          restructure_count: number
          restructured_at: string | null
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
          user_id: string
          written_off_amount: number | null
          written_off_at: string | null
        }
        Insert: {
          amount: number
          arrears_amount?: number
          arrears_bucket?: string
          arrears_refreshed_at?: string | null
          created_at?: string
          days_past_due?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          disbursed_at?: string | null
          disbursed_by?: string | null
          disbursement_account_id?: string | null
          disbursement_channel?: string | null
          disbursement_note?: string | null
          disbursement_reference?: string | null
          disbursement_requested_at?: string | null
          disbursement_requested_by?: string | null
          disbursement_status?: string
          first_payment_at?: string | null
          id?: string
          interest_rate?: number
          interest_start_at?: string | null
          maturity_at?: string | null
          monthly_payment?: number | null
          outstanding_principal?: number
          penalty_accrued?: number
          penalty_paid?: number
          product: string
          product_id?: string | null
          purpose?: string | null
          ref: string
          restructure_count?: number
          restructured_at?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at?: string
          user_id: string
          written_off_amount?: number | null
          written_off_at?: string | null
        }
        Update: {
          amount?: number
          arrears_amount?: number
          arrears_bucket?: string
          arrears_refreshed_at?: string | null
          created_at?: string
          days_past_due?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          disbursed_at?: string | null
          disbursed_by?: string | null
          disbursement_account_id?: string | null
          disbursement_channel?: string | null
          disbursement_note?: string | null
          disbursement_reference?: string | null
          disbursement_requested_at?: string | null
          disbursement_requested_by?: string | null
          disbursement_status?: string
          first_payment_at?: string | null
          id?: string
          interest_rate?: number
          interest_start_at?: string | null
          maturity_at?: string | null
          monthly_payment?: number | null
          outstanding_principal?: number
          penalty_accrued?: number
          penalty_paid?: number
          product?: string
          product_id?: string | null
          purpose?: string | null
          ref?: string
          restructure_count?: number
          restructured_at?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          term_months?: number
          updated_at?: string
          user_id?: string
          written_off_amount?: number | null
          written_off_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_disbursement_account_id_fkey"
            columns: ["disbursement_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          created_at: string
          id: string
          method: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          method?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          method?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      member_files: {
        Row: {
          category: string
          checksum: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          filename: string
          id: string
          loan_id: string | null
          mime_type: string
          owner_id: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          shared_with_staff: boolean
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category?: string
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          filename: string
          id?: string
          loan_id?: string | null
          mime_type: string
          owner_id: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shared_with_staff?: boolean
          size_bytes: number
          storage_path: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category?: string
          checksum?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          filename?: string
          id?: string
          loan_id?: string | null
          mime_type?: string
          owner_id?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shared_with_staff?: boolean
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_files_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      minor_status_changes: {
        Row: {
          change_kind: string
          changed_at: string
          changed_by: string | null
          db_role: string | null
          id: string
          is_minor: boolean
          member_id: string
          previous_date_of_birth: string | null
          source_date_of_birth: string | null
          was_minor: boolean | null
        }
        Insert: {
          change_kind: string
          changed_at?: string
          changed_by?: string | null
          db_role?: string | null
          id?: string
          is_minor: boolean
          member_id: string
          previous_date_of_birth?: string | null
          source_date_of_birth?: string | null
          was_minor?: boolean | null
        }
        Update: {
          change_kind?: string
          changed_at?: string
          changed_by?: string | null
          db_role?: string | null
          id?: string
          is_minor?: boolean
          member_id?: string
          previous_date_of_birth?: string | null
          source_date_of_birth?: string | null
          was_minor?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "minor_status_changes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      national_id_claims: {
        Row: {
          created_at: string
          id_key: string
          member_id: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id_key: string
          member_id: string
          source: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id_key?: string
          member_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      next_of_kin: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          member_id: string
          national_id: string | null
          national_id_type: string | null
          phone: string | null
          relationship: string
          relationship_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          member_id: string
          national_id?: string | null
          national_id_type?: string | null
          phone?: string | null
          relationship: string
          relationship_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          member_id?: string
          national_id?: string | null
          national_id_type?: string | null
          phone?: string | null
          relationship?: string
          relationship_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "next_of_kin_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          body: string | null
          category: string
          channel: string
          created_at: string
          dedupe_key: string | null
          error: string | null
          id: string
          link: string | null
          meta: Json
          sent_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          body?: string | null
          category: string
          channel: string
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          link?: string | null
          meta?: Json
          sent_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string | null
          category?: string
          channel?: string
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          id?: string
          link?: string | null
          meta?: Json
          sent_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email: boolean
          in_app: boolean
          muted_categories: string[]
          sms: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: boolean
          in_app?: boolean
          muted_categories?: string[]
          sms?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: boolean
          in_app?: boolean
          muted_categories?: string[]
          sms?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      passkey_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          id: string
          kind: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at?: string
          id?: string
          kind: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount_minor: number
          cancel_reason: string | null
          created_at: string
          created_by: string | null
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          member_id: string | null
          metadata: Json
          payer_network: string | null
          payer_phone: string | null
          provider_code: string
          provider_reference: string | null
          purpose: string
          rail: string
          reference: string
          settled_at: string | null
          settled_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          member_id?: string | null
          metadata?: Json
          payer_network?: string | null
          payer_phone?: string | null
          provider_code: string
          provider_reference?: string | null
          purpose?: string
          rail?: string
          reference: string
          settled_at?: string | null
          settled_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          member_id?: string | null
          metadata?: Json
          payer_network?: string | null
          payer_phone?: string | null
          provider_code?: string
          provider_reference?: string | null
          purpose?: string
          rail?: string
          reference?: string
          settled_at?: string | null
          settled_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers: {
        Row: {
          code: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          label: string
          mode: string
          secret_ref: string | null
          updated_at: string
          webhook_path: string | null
        }
        Insert: {
          code: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          mode?: string
          secret_ref?: string | null
          updated_at?: string
          webhook_path?: string | null
        }
        Update: {
          code?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          mode?: string
          secret_ref?: string | null
          updated_at?: string
          webhook_path?: string | null
        }
        Relationships: []
      }
      payment_rail_settings: {
        Row: {
          enabled: boolean
          note: string | null
          rail: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          note?: string | null
          rail: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          note?: string | null
          rail?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          id: string
          intent_id: string
          issued_at: string
          issued_by: string | null
          receipt_no: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency?: string
          id?: string
          intent_id: string
          issued_at?: string
          issued_by?: string | null
          receipt_no: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          id?: string
          intent_id?: string
          issued_at?: string
          issued_by?: string | null
          receipt_no?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refunds: {
        Row: {
          amount_minor: number
          approved_by: string | null
          created_at: string
          currency: string
          decided_at: string | null
          decision_note: string | null
          id: string
          intent_id: string
          provider_reference: string | null
          reason: string
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          approved_by?: string | null
          created_at?: string
          currency?: string
          decided_at?: string | null
          decision_note?: string | null
          id?: string
          intent_id: string
          provider_reference?: string | null
          reason: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          approved_by?: string | null
          created_at?: string
          currency?: string
          decided_at?: string | null
          decision_note?: string | null
          id?: string
          intent_id?: string
          provider_reference?: string | null
          reason?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          body_hash: string | null
          created_at: string
          error: string | null
          event_id: string | null
          event_type: string | null
          id: string
          payload: Json
          processed_at: string | null
          provider_code: string
          signature_verified: boolean
        }
        Insert: {
          body_hash?: string | null
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider_code: string
          signature_verified?: boolean
        }
        Update: {
          body_hash?: string | null
          created_at?: string
          error?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider_code?: string
          signature_verified?: boolean
        }
        Relationships: []
      }
      presence_sessions: {
        Row: {
          created_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_line: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          date_of_birth: string | null
          digital_address: string | null
          district: string | null
          employer: string | null
          full_name: string | null
          gender: string | null
          ghana_card: string | null
          id: string
          is_minor: boolean
          kyc: Database["public"]["Enums"]["kyc_status"]
          kyc_assigned_at: string | null
          kyc_assigned_to: string | null
          kyc_attempts: number
          kyc_deadline_expired_notified_at: string | null
          kyc_deadline_reminded_at: string | null
          kyc_final_reminded_at: string | null
          kyc_flag_reason: string | null
          kyc_flagged_at: string | null
          kyc_low_attempts_reminded_at: string | null
          kyc_max_attempts: number | null
          kyc_notes: string | null
          kyc_rejection_snapshot: Json | null
          kyc_remediation_items: Json
          kyc_resubmission_deadline: string | null
          kyc_resubmitted_at: string | null
          kyc_reviewed_at: string | null
          kyc_reviewed_by: string | null
          kyc_risk_flags: Json | null
          kyc_risk_level: string | null
          kyc_submitted_at: string | null
          member_no: string | null
          membership_type: string
          national_id: string | null
          national_id_type: string | null
          occupation: string | null
          phone: string | null
          region: string | null
          rejection_reason: string | null
          status: string
          tier: Database["public"]["Enums"]["member_tier"]
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          date_of_birth?: string | null
          digital_address?: string | null
          district?: string | null
          employer?: string | null
          full_name?: string | null
          gender?: string | null
          ghana_card?: string | null
          id: string
          is_minor?: boolean
          kyc?: Database["public"]["Enums"]["kyc_status"]
          kyc_assigned_at?: string | null
          kyc_assigned_to?: string | null
          kyc_attempts?: number
          kyc_deadline_expired_notified_at?: string | null
          kyc_deadline_reminded_at?: string | null
          kyc_final_reminded_at?: string | null
          kyc_flag_reason?: string | null
          kyc_flagged_at?: string | null
          kyc_low_attempts_reminded_at?: string | null
          kyc_max_attempts?: number | null
          kyc_notes?: string | null
          kyc_rejection_snapshot?: Json | null
          kyc_remediation_items?: Json
          kyc_resubmission_deadline?: string | null
          kyc_resubmitted_at?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          kyc_risk_flags?: Json | null
          kyc_risk_level?: string | null
          kyc_submitted_at?: string | null
          member_no?: string | null
          membership_type?: string
          national_id?: string | null
          national_id_type?: string | null
          occupation?: string | null
          phone?: string | null
          region?: string | null
          rejection_reason?: string | null
          status?: string
          tier?: Database["public"]["Enums"]["member_tier"]
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          date_of_birth?: string | null
          digital_address?: string | null
          district?: string | null
          employer?: string | null
          full_name?: string | null
          gender?: string | null
          ghana_card?: string | null
          id?: string
          is_minor?: boolean
          kyc?: Database["public"]["Enums"]["kyc_status"]
          kyc_assigned_at?: string | null
          kyc_assigned_to?: string | null
          kyc_attempts?: number
          kyc_deadline_expired_notified_at?: string | null
          kyc_deadline_reminded_at?: string | null
          kyc_final_reminded_at?: string | null
          kyc_flag_reason?: string | null
          kyc_flagged_at?: string | null
          kyc_low_attempts_reminded_at?: string | null
          kyc_max_attempts?: number | null
          kyc_notes?: string | null
          kyc_rejection_snapshot?: Json | null
          kyc_remediation_items?: Json
          kyc_resubmission_deadline?: string | null
          kyc_resubmitted_at?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          kyc_risk_flags?: Json | null
          kyc_risk_level?: string | null
          kyc_submitted_at?: string | null
          member_no?: string | null
          membership_type?: string
          national_id?: string | null
          national_id_type?: string | null
          occupation?: string | null
          phone?: string | null
          region?: string | null
          rejection_reason?: string | null
          status?: string
          tier?: Database["public"]["Enums"]["member_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      recycle_bin: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          entity_id: string
          entity_table: string
          id: string
          payload: Json
          purge_after: string
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          entity_id: string
          entity_table: string
          id?: string
          payload: Json
          purge_after?: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          entity_id?: string
          entity_table?: string
          id?: string
          payload?: Json
          purge_after?: string
        }
        Relationships: []
      }
      relationship_types: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          action: string
          created_at: string
          id: string
          module: string
          role: string
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          module: string
          role: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          module?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      runtime_error_logs: {
        Row: {
          actor_role: string | null
          id: string
          kind: string
          message: string
          meta: Json
          occurred_at: string
          route: string | null
          severity: string
          stack: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          actor_role?: string | null
          id?: string
          kind: string
          message: string
          meta?: Json
          occurred_at?: string
          route?: string | null
          severity?: string
          stack?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          actor_role?: string | null
          id?: string
          kind?: string
          message?: string
          meta?: Json
          occurred_at?: string
          route?: string | null
          severity?: string
          stack?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      runtime_log_retention: {
        Row: {
          auto_purge_enabled: boolean
          id: number
          last_purge_at: string | null
          last_purge_deleted: number | null
          retention_error_days: number
          retention_info_days: number
          retention_warning_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_purge_enabled?: boolean
          id?: number
          last_purge_at?: string | null
          last_purge_deleted?: number | null
          retention_error_days?: number
          retention_info_days?: number
          retention_warning_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_purge_enabled?: boolean
          id?: number
          last_purge_at?: string | null
          last_purge_deleted?: number | null
          retention_error_days?: number
          retention_info_days?: number
          retention_warning_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      savings_accounts: {
        Row: {
          balance: number
          created_at: string
          goal_amount: number | null
          goal_completed_at: string | null
          goal_started_at: string | null
          goal_target_date: string | null
          id: string
          last_milestone_pct: number
          nickname: string | null
          plan_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          goal_amount?: number | null
          goal_completed_at?: string | null
          goal_started_at?: string | null
          goal_target_date?: string | null
          id?: string
          last_milestone_pct?: number
          nickname?: string | null
          plan_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          goal_amount?: number | null
          goal_completed_at?: string | null
          goal_started_at?: string | null
          goal_target_date?: string | null
          id?: string
          last_milestone_pct?: number
          nickname?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_accounts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "savings_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_accounts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_deposit_requests: {
        Row: {
          account_id: string
          amount: number
          channel: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          note: string | null
          payment_reference: string | null
          ref: string
          status: string
          txn_id: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          channel?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          note?: string | null
          payment_reference?: string | null
          ref?: string
          status?: string
          txn_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          channel?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          note?: string | null
          payment_reference?: string | null
          ref?: string
          status?: string
          txn_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_deposit_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_holds: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          created_by: string | null
          created_by_role: string | null
          id: string
          loan_id: string | null
          reason: string
          release_reason: string | null
          released_at: string | null
          released_by: string | null
          status: Database["public"]["Enums"]["savings_hold_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          id?: string
          loan_id?: string | null
          reason: string
          release_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          status?: Database["public"]["Enums"]["savings_hold_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          id?: string
          loan_id?: string | null
          reason?: string
          release_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          status?: Database["public"]["Enums"]["savings_hold_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_holds_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_holds_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_holds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_interest_runs: {
        Row: {
          accounts_credited: number
          accounts_processed: number
          basis: string
          created_at: string
          dry_run: boolean
          executed_by: string | null
          frequency: string
          id: string
          note: string | null
          period_end: string
          period_start: string
          rate_source: string
          total_interest: number
        }
        Insert: {
          accounts_credited?: number
          accounts_processed?: number
          basis: string
          created_at?: string
          dry_run?: boolean
          executed_by?: string | null
          frequency: string
          id?: string
          note?: string | null
          period_end: string
          period_start: string
          rate_source: string
          total_interest?: number
        }
        Update: {
          accounts_credited?: number
          accounts_processed?: number
          basis?: string
          created_at?: string
          dry_run?: boolean
          executed_by?: string | null
          frequency?: string
          id?: string
          note?: string | null
          period_end?: string
          period_start?: string
          rate_source?: string
          total_interest?: number
        }
        Relationships: []
      }
      savings_interest_settings: {
        Row: {
          basis: string
          enabled: boolean
          exclude_held_funds: boolean
          flat_rate_annual: number
          frequency: string
          id: number
          min_balance_to_earn: number
          min_interest_to_post: number
          rate_source: string
          rounding_dp: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          basis?: string
          enabled?: boolean
          exclude_held_funds?: boolean
          flat_rate_annual?: number
          frequency?: string
          id?: number
          min_balance_to_earn?: number
          min_interest_to_post?: number
          rate_source?: string
          rounding_dp?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          basis?: string
          enabled?: boolean
          exclude_held_funds?: boolean
          flat_rate_annual?: number
          frequency?: string
          id?: number
          min_balance_to_earn?: number
          min_interest_to_post?: number
          rate_source?: string
          rounding_dp?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      savings_plans: {
        Row: {
          contribution_amount: number
          created_at: string
          description: string | null
          id: string
          interest_rate: number
          is_active: boolean
          lock_days: number
          min_contribution: number
          name: string
          schedule: string
          sort_order: number
        }
        Insert: {
          contribution_amount?: number
          created_at?: string
          description?: string | null
          id?: string
          interest_rate?: number
          is_active?: boolean
          lock_days?: number
          min_contribution?: number
          name: string
          schedule: string
          sort_order?: number
        }
        Update: {
          contribution_amount?: number
          created_at?: string
          description?: string | null
          id?: string
          interest_rate?: number
          is_active?: boolean
          lock_days?: number
          min_contribution?: number
          name?: string
          schedule?: string
          sort_order?: number
        }
        Relationships: []
      }
      savings_recurring_contributions: {
        Row: {
          account_id: string
          amount: number
          channel: string
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id: string
          last_run_at: string | null
          last_run_error: string | null
          last_run_status: string | null
          next_run_at: string
          note: string | null
          runs_completed: number
          status: Database["public"]["Enums"]["recurring_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          channel?: string
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_status?: string | null
          next_run_at: string
          note?: string | null
          runs_completed?: number
          status?: Database["public"]["Enums"]["recurring_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          channel?: string
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_status?: string | null
          next_run_at?: string
          note?: string | null
          runs_completed?: number
          status?: Database["public"]["Enums"]["recurring_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_recurring_contributions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_statements: {
        Row: {
          account_id: string
          closing_balance: number
          deposits_total: number
          generated_at: string
          id: string
          interest_credited: number
          opening_balance: number
          period_end: string
          period_start: string
          user_id: string
          withdrawals_total: number
        }
        Insert: {
          account_id: string
          closing_balance: number
          deposits_total?: number
          generated_at?: string
          id?: string
          interest_credited?: number
          opening_balance: number
          period_end: string
          period_start: string
          user_id: string
          withdrawals_total?: number
        }
        Update: {
          account_id?: string
          closing_balance?: number
          deposits_total?: number
          generated_at?: string
          id?: string
          interest_credited?: number
          opening_balance?: number
          period_end?: string
          period_start?: string
          user_id?: string
          withdrawals_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "savings_statements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_sweeps: {
        Row: {
          amount: number
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          from_account_id: string
          id: string
          last_run_amount: number | null
          last_run_at: string | null
          last_run_error: string | null
          last_run_status: string | null
          max_amount: number | null
          min_balance: number
          next_run_at: string
          note: string | null
          runs_completed: number
          status: Database["public"]["Enums"]["recurring_status"]
          to_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          from_account_id: string
          id?: string
          last_run_amount?: number | null
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_status?: string | null
          max_amount?: number | null
          min_balance?: number
          next_run_at?: string
          note?: string | null
          runs_completed?: number
          status?: Database["public"]["Enums"]["recurring_status"]
          to_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          from_account_id?: string
          id?: string
          last_run_amount?: number | null
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_status?: string | null
          max_amount?: number | null
          min_balance?: number
          next_run_at?: string
          note?: string | null
          runs_completed?: number
          status?: Database["public"]["Enums"]["recurring_status"]
          to_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_sweeps_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_sweeps_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_withdrawal_requests: {
        Row: {
          account_id: string
          amount: number
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          balance_at_request: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          channel: string
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          reason: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["withdrawal_request_status"]
          txn_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          balance_at_request?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: string | null
          channel?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          reason: string
          ref: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["withdrawal_request_status"]
          txn_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          balance_at_request?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_role?: string | null
          channel?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          reason?: string
          ref?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["withdrawal_request_status"]
          txn_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_withdrawal_requests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_withdrawal_settings: {
        Row: {
          daily_limit: number
          id: number
          max_amount: number
          min_amount: number
          require_dual_control: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          daily_limit?: number
          id?: number
          max_amount?: number
          min_amount?: number
          require_dual_control?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          daily_limit?: number
          id?: number
          max_amount?: number
          min_amount?: number
          require_dual_control?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      security_alert_settings: {
        Row: {
          audit_action_prefixes: string[]
          audit_alerts_enabled: boolean
          audit_min_severity: string
          channels: string[]
          created_at: string
          enabled: boolean
          id: boolean
          notify_roles: string[]
          rate_limit_alerts_enabled: boolean
          throttle_minutes: number
          updated_at: string
          updated_by: string | null
          upload_alerts_enabled: boolean
        }
        Insert: {
          audit_action_prefixes?: string[]
          audit_alerts_enabled?: boolean
          audit_min_severity?: string
          channels?: string[]
          created_at?: string
          enabled?: boolean
          id?: boolean
          notify_roles?: string[]
          rate_limit_alerts_enabled?: boolean
          throttle_minutes?: number
          updated_at?: string
          updated_by?: string | null
          upload_alerts_enabled?: boolean
        }
        Update: {
          audit_action_prefixes?: string[]
          audit_alerts_enabled?: boolean
          audit_min_severity?: string
          channels?: string[]
          created_at?: string
          enabled?: boolean
          id?: boolean
          notify_roles?: string[]
          rate_limit_alerts_enabled?: boolean
          throttle_minutes?: number
          updated_at?: string
          updated_by?: string | null
          upload_alerts_enabled?: boolean
        }
        Relationships: []
      }
      security_ip_rules: {
        Row: {
          cidr: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          mode: string
          note: string | null
          updated_at: string
        }
        Insert: {
          cidr: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          mode?: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          cidr?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          mode?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      security_rate_limits: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          max_requests: number
          note: string | null
          scope: string
          updated_at: string
          window_seconds: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          max_requests?: number
          note?: string | null
          scope: string
          updated_at?: string
          window_seconds?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          max_requests?: number
          note?: string | null
          scope?: string
          updated_at?: string
          window_seconds?: number
        }
        Relationships: []
      }
      security_settings: {
        Row: {
          allowed_upload_mime: string[]
          block_executables: boolean
          created_at: string
          firewall_enabled: boolean
          id: boolean
          ip_allowlist_only: boolean
          max_upload_mb: number
          rate_limiting_enabled: boolean
          updated_at: string
          updated_by: string | null
          upload_scanning_enabled: boolean
        }
        Insert: {
          allowed_upload_mime?: string[]
          block_executables?: boolean
          created_at?: string
          firewall_enabled?: boolean
          id?: boolean
          ip_allowlist_only?: boolean
          max_upload_mb?: number
          rate_limiting_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          upload_scanning_enabled?: boolean
        }
        Update: {
          allowed_upload_mime?: string[]
          block_executables?: boolean
          created_at?: string
          firewall_enabled?: boolean
          id?: boolean
          ip_allowlist_only?: boolean
          max_upload_mb?: number
          rate_limiting_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          upload_scanning_enabled?: boolean
        }
        Relationships: []
      }
      settings_change_requests: {
        Row: {
          applied_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["settings_change_kind"]
          payload: Json
          requested_at: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["settings_change_status"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: Database["public"]["Enums"]["settings_change_kind"]
          payload: Json
          requested_at?: string
          requested_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["settings_change_status"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["settings_change_kind"]
          payload?: Json
          requested_at?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["settings_change_status"]
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      settings_snapshots: {
        Row: {
          branding: Json | null
          created_at: string
          created_by: string
          id: string
          label: string
          note: string | null
        }
        Insert: {
          branding?: Json | null
          created_at?: string
          created_by: string
          id?: string
          label: string
          note?: string | null
        }
        Update: {
          branding?: Json | null
          created_at?: string
          created_by?: string
          id?: string
          label?: string
          note?: string | null
        }
        Relationships: []
      }
      share_holdings: {
        Row: {
          cost_basis: number
          created_at: string
          id: string
          product_id: string
          total_dividends: number
          units: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_basis?: number
          created_at?: string
          id?: string
          product_id: string
          total_dividends?: number
          units?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_basis?: number
          created_at?: string
          id?: string
          product_id?: string
          total_dividends?: number
          units?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_holdings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "share_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      share_products: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          dividend_rate_annual: number
          id: string
          is_active: boolean
          max_units_per_member: number | null
          min_units: number
          name: string
          total_units_issued: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          dividend_rate_annual?: number
          id?: string
          is_active?: boolean
          max_units_per_member?: number | null
          min_units?: number
          name: string
          total_units_issued?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          dividend_rate_annual?: number
          id?: string
          is_active?: boolean
          max_units_per_member?: number | null
          min_units?: number
          name?: string
          total_units_issued?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      share_transactions: {
        Row: {
          actor_id: string | null
          amount: number
          created_at: string
          dividend_run_id: string | null
          holding_id: string
          id: string
          kind: Database["public"]["Enums"]["share_txn_kind"]
          note: string | null
          product_id: string
          ref: string
          savings_account_id: string | null
          txn_id: string | null
          unit_price: number
          units: number
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          amount: number
          created_at?: string
          dividend_run_id?: string | null
          holding_id: string
          id?: string
          kind: Database["public"]["Enums"]["share_txn_kind"]
          note?: string | null
          product_id: string
          ref: string
          savings_account_id?: string | null
          txn_id?: string | null
          unit_price: number
          units: number
          user_id: string
        }
        Update: {
          actor_id?: string | null
          amount?: number
          created_at?: string
          dividend_run_id?: string | null
          holding_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["share_txn_kind"]
          note?: string | null
          product_id?: string
          ref?: string
          savings_account_id?: string | null
          txn_id?: string | null
          unit_price?: number
          units?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_transactions_dividend_run_id_fkey"
            columns: ["dividend_run_id"]
            isOneToOne: false
            referencedRelation: "dividend_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "share_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "share_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_transactions_savings_account_id_fkey"
            columns: ["savings_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_transactions_txn_id_fkey"
            columns: ["txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_job_lease: {
        Row: {
          id: string
          locked_until: string
          updated_at: string
        }
        Insert: {
          id: string
          locked_until?: string
          updated_at?: string
        }
        Update: {
          id?: string
          locked_until?: string
          updated_at?: string
        }
        Relationships: []
      }
      statement_runs: {
        Row: {
          channels: string[]
          created_at: string
          error: string | null
          id: string
          period_end: string
          period_start: string
          row_count: number
          schedule_id: string
          status: string
          user_id: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          error?: string | null
          id?: string
          period_end: string
          period_start: string
          row_count?: number
          schedule_id: string
          status?: string
          user_id: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          error?: string | null
          id?: string
          period_end?: string
          period_start?: string
          row_count?: number
          schedule_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "statement_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_schedules: {
        Row: {
          active: boolean
          created_at: string
          dataset: string
          email: boolean
          failure_count: number
          frequency: string
          id: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          next_run_at: string
          sms: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dataset: string
          email?: boolean
          failure_count?: number
          frequency: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string
          sms?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dataset?: string
          email?: boolean
          failure_count?: number
          frequency?: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string
          sms?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      super_admin_seed_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          note: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          note?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          attachment_path: string | null
          author_id: string | null
          author_role: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          is_staff: boolean
          ticket_id: string
        }
        Insert: {
          attachment_path?: string | null
          author_id?: string | null
          author_role?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          is_staff?: boolean
          ticket_id: string
        }
        Update: {
          attachment_path?: string | null
          author_id?: string | null
          author_role?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          is_staff?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assignee_id: string | null
          attachment_path: string | null
          category: Database["public"]["Enums"]["support_category"]
          closed_at: string | null
          created_at: string
          first_response_at: string | null
          id: string
          last_member_activity_at: string
          last_staff_activity_at: string | null
          priority: Database["public"]["Enums"]["support_priority"]
          ref: string
          reopened_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee_id?: string | null
          attachment_path?: string | null
          category?: Database["public"]["Enums"]["support_category"]
          closed_at?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          last_member_activity_at?: string
          last_staff_activity_at?: string | null
          priority?: Database["public"]["Enums"]["support_priority"]
          ref?: string
          reopened_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee_id?: string | null
          attachment_path?: string | null
          category?: Database["public"]["Enums"]["support_category"]
          closed_at?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          last_member_activity_at?: string
          last_staff_activity_at?: string | null
          priority?: Database["public"]["Enums"]["support_priority"]
          ref?: string
          reopened_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      teller_sessions: {
        Row: {
          close_note: string | null
          closed_at: string | null
          counted_close: number | null
          created_at: string
          expected_close: number | null
          id: string
          open_note: string | null
          opened_at: string
          opening_float: number
          status: string
          teller_id: string
          updated_at: string
          variance: number | null
        }
        Insert: {
          close_note?: string | null
          closed_at?: string | null
          counted_close?: number | null
          created_at?: string
          expected_close?: number | null
          id?: string
          open_note?: string | null
          opened_at?: string
          opening_float?: number
          status?: string
          teller_id: string
          updated_at?: string
          variance?: number | null
        }
        Update: {
          close_note?: string | null
          closed_at?: string | null
          counted_close?: number | null
          created_at?: string
          expected_close?: number | null
          id?: string
          open_note?: string | null
          opened_at?: string
          opening_float?: number
          status?: string
          teller_id?: string
          updated_at?: string
          variance?: number | null
        }
        Relationships: []
      }
      teller_transactions: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          device_info: Json
          id: string
          kind: string
          loan_id: string | null
          member_id: string
          method: string
          note: string | null
          reference: string
          session_id: string
          teller_id: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          device_info?: Json
          id?: string
          kind: string
          loan_id?: string | null
          member_id: string
          method?: string
          note?: string | null
          reference: string
          session_id: string
          teller_id: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          device_info?: Json
          id?: string
          kind?: string
          loan_id?: string | null
          member_id?: string
          method?: string
          note?: string | null
          reference?: string
          session_id?: string
          teller_id?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teller_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "teller_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          channel: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["txn_kind"]
          loan_id: string | null
          note: string | null
          ref: string
          savings_account_id: string | null
          status: Database["public"]["Enums"]["txn_status"]
          user_id: string
        }
        Insert: {
          amount: number
          channel?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["txn_kind"]
          loan_id?: string | null
          note?: string | null
          ref: string
          savings_account_id?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
          user_id: string
        }
        Update: {
          amount?: number
          channel?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["txn_kind"]
          loan_id?: string | null
          note?: string | null
          ref?: string
          savings_account_id?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_savings_account_id_fkey"
            columns: ["savings_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount: number
          channel: string | null
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          from_account_id: string
          id: string
          in_txn_id: string | null
          note: string | null
          out_txn_id: string | null
          ref: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_account_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          channel?: string | null
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          created_by?: string | null
          from_account_id: string
          id?: string
          in_txn_id?: string | null
          note?: string | null
          out_txn_id?: string | null
          ref?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_account_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          channel?: string | null
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          created_by?: string | null
          from_account_id?: string
          id?: string
          in_txn_id?: string | null
          note?: string | null
          out_txn_id?: string | null
          ref?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "savings_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_scan_log: {
        Row: {
          created_at: string
          filename: string
          id: string
          mime_type: string | null
          reasons: string[]
          size_bytes: number | null
          user_id: string | null
          verdict: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          mime_type?: string | null
          reasons?: string[]
          size_bytes?: number | null
          user_id?: string | null
          verdict?: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string | null
          reasons?: string[]
          size_bytes?: number | null
          user_id?: string | null
          verdict?: string
        }
        Relationships: []
      }
      user_passkeys: {
        Row: {
          backed_up: boolean
          counter: number
          created_at: string
          credential_id: string
          device_label: string | null
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[]
          user_id: string
        }
        Insert: {
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[]
          user_id: string
        }
        Update: {
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id?: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accrue_monthly_interest: {
        Args: { _period_end?: string }
        Returns: {
          account_id: string
          closing_balance: number
          interest: number
        }[]
      }
      add_loan_collateral: {
        Args: {
          _actor_id: string
          _description: string
          _kind: string
          _loan_id: string
          _reference_no: string
          _savings_hold_id: string
          _value: number
        }
        Returns: {
          created_at: string
          created_by: string | null
          currency: string
          description: string
          estimated_value: number
          id: string
          kind: string
          loan_id: string
          reference_no: string | null
          release_note: string | null
          released_at: string | null
          released_by: string | null
          savings_hold_id: string | null
          status: Database["public"]["Enums"]["collateral_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "loan_collateral"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_loan_guarantor: {
        Args: {
          _actor_id: string
          _amount: number
          _email: string
          _full_name: string
          _loan_id: string
          _member_id: string
          _phone: string
          _relationship: string
        }
        Returns: {
          consent: Database["public"]["Enums"]["guarantor_consent_status"]
          consent_at: string | null
          consent_note: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          guaranteed_amount: number
          id: string
          loan_id: string
          member_id: string | null
          phone: string | null
          relationship: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "loan_guarantors"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_assign_role: {
        Args: {
          _actor_id: string
          _note?: string
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      admin_cancel_savings_withdrawal: {
        Args: {
          _actor_id: string
          _actor_role?: string
          _id: string
          _reason: string
        }
        Returns: {
          account_id: string
          amount: number
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          balance_at_request: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          channel: string
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          reason: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["withdrawal_request_status"]
          txn_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_withdrawal_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_revoke_role: {
        Args: {
          _actor_id: string
          _reason: string
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      admin_set_role_permissions: {
        Args: { _actor: string; _capabilities: string[]; _role: string }
        Returns: number
      }
      advance_recurring_next_run: {
        Args: {
          _dom: number
          _dow: number
          _frequency: Database["public"]["Enums"]["recurring_frequency"]
          _from: string
        }
        Returns: string
      }
      apply_settings_change: {
        Args: { _id: string; _note: string }
        Returns: {
          applied_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["settings_change_kind"]
          payload: Json
          requested_at: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["settings_change_status"]
          summary: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "settings_change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_dividend_run: {
        Args: { _actor_id: string; _note?: string; _run_id: string }
        Returns: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          executed_at: string | null
          executed_by: string | null
          id: string
          members_paid: number
          note: string | null
          per_unit_amount: number
          period_end: string
          period_start: string
          product_id: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          total_paid: number
          units_paid: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dividend_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_entity:
        | {
            Args: { _entity_id: string; _note: string }
            Returns: {
              address_line: string | null
              contact_email: string | null
              contact_phone: string | null
              created_at: string
              created_by: string | null
              digital_address: string | null
              id: string
              kyc_notes: string | null
              name: string
              parent_entity_id: string | null
              region: string | null
              registration_no: string | null
              reviewed_at: string | null
              reviewed_by: string | null
              status: Database["public"]["Enums"]["entity_status"]
              tax_id: string | null
              type: Database["public"]["Enums"]["entity_type"]
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "entities"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { _actor_id?: string; _entity_id: string; _note: string }
            Returns: {
              address_line: string | null
              contact_email: string | null
              contact_phone: string | null
              created_at: string
              created_by: string | null
              digital_address: string | null
              id: string
              kyc_notes: string | null
              name: string
              parent_entity_id: string | null
              region: string | null
              registration_no: string | null
              reviewed_at: string | null
              reviewed_by: string | null
              status: Database["public"]["Enums"]["entity_status"]
              tax_id: string | null
              type: Database["public"]["Enums"]["entity_type"]
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "entities"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      approve_expense: {
        Args: { _actor_id: string; _expense_id: string }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category_code: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          incurred_on: string
          notes: string | null
          paid_on: string | null
          paid_txn_id: string | null
          payment_channel: string | null
          ref: string
          reference: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          vendor: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_savings_withdrawal: {
        Args: { _actor_id: string; _id: string; _note: string }
        Returns: {
          account_id: string
          amount: number
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          balance_at_request: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          channel: string
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          reason: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["withdrawal_request_status"]
          txn_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_withdrawal_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_settings_change: {
        Args: { _id: string; _note: string }
        Returns: {
          applied_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["settings_change_kind"]
          payload: Json
          requested_at: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["settings_change_status"]
          summary: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "settings_change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_user:
        | { Args: { _note?: string; _uid: string }; Returns: undefined }
        | {
            Args: { _actor: string; _note: string; _uid: string }
            Returns: undefined
          }
      archive_audit_log_entries: { Args: { _ids: string[] }; Returns: number }
      archive_runtime_error_logs: { Args: { _ids: string[] }; Returns: number }
      assess_loan_penalties: { Args: never; Returns: Json }
      break_fixed_deposit: {
        Args: { _actor_id?: string; _id: string; _reason: string }
        Returns: {
          break_reason: string | null
          broken_at: string | null
          close_txn_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          interest_expected: number
          interest_paid: number
          maturity_date: string
          open_txn_id: string | null
          penalty_amount: number
          principal: number
          product_id: string
          rate_annual: number
          ref: string
          rollover: string
          source_account_id: string
          start_date: string
          status: Database["public"]["Enums"]["fixed_deposit_status"]
          term_months: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "fixed_deposits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_loan_disbursement: {
        Args: { _loan_id: string; _reason: string }
        Returns: {
          amount: number
          arrears_amount: number
          arrears_bucket: string
          arrears_refreshed_at: string | null
          created_at: string
          days_past_due: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          disbursed_at: string | null
          disbursed_by: string | null
          disbursement_account_id: string | null
          disbursement_channel: string | null
          disbursement_note: string | null
          disbursement_reference: string | null
          disbursement_requested_at: string | null
          disbursement_requested_by: string | null
          disbursement_status: string
          first_payment_at: string | null
          id: string
          interest_rate: number
          interest_start_at: string | null
          maturity_at: string | null
          monthly_payment: number | null
          outstanding_principal: number
          penalty_accrued: number
          penalty_paid: number
          product: string
          product_id: string | null
          purpose: string | null
          ref: string
          restructure_count: number
          restructured_at: string | null
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
          user_id: string
          written_off_amount: number | null
          written_off_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "loans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_loan_settlement: {
        Args: { _actor_id?: string; _note?: string; _request_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_email: string | null
          decision_note: string | null
          id: string
          loan_id: string
          member_note: string | null
          quote: Json
          quoted_total: number
          requested_at: string
          settle_on: string
          status: Database["public"]["Enums"]["settlement_request_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "loan_settlement_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_savings_deposit: { Args: { _id: string }; Returns: undefined }
      cancel_savings_withdrawal: {
        Args: { _id: string; _reason?: string }
        Returns: {
          account_id: string
          amount: number
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          balance_at_request: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          channel: string
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          reason: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["withdrawal_request_status"]
          txn_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_withdrawal_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      canonical_ghana_card: { Args: { _value: string }; Returns: string }
      check_loan_eligibility: {
        Args: {
          _amount: number
          _product_id: string
          _term_months: number
          _user_id: string
        }
        Returns: Json
      }
      check_registration_availability: {
        Args: { _ghana_card: string; _phone: string }
        Returns: Json
      }
      claim_cron_run: {
        Args: {
          _caller?: string
          _job: string
          _run_key: string
          _stale_after?: string
        }
        Returns: {
          attempt: number
          caller: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          job: string
          metrics: Json
          run_key: string
          started_at: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cron_job_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_statement_job_lease: {
        Args: { _minutes?: number }
        Returns: boolean
      }
      clear_my_read_notifications: { Args: never; Returns: number }
      clear_transfer: {
        Args: { _actor_id: string; _transfer_id: string }
        Returns: {
          amount: number
          channel: string | null
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          from_account_id: string
          id: string
          in_txn_id: string | null
          note: string | null
          out_txn_id: string | null
          ref: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_account_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      contribute_to_pot: {
        Args: {
          _account_id: string
          _actor_id?: string
          _amount: number
          _note: string
          _pot_id: string
        }
        Returns: {
          amount: number
          created_at: string
          cycle: number
          id: string
          note: string | null
          pot_id: string
          profile_id: string
          savings_account_id: string | null
          txn_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "group_pot_contributions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_settings_snapshot: {
        Args: { _label: string; _note: string }
        Returns: {
          branding: Json | null
          created_at: string
          created_by: string
          id: string
          label: string
          note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "settings_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_loan_restructure: {
        Args: {
          _actor_id: string
          _approve: boolean
          _note: string
          _request_id: string
        }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_email: string | null
          decision_note: string | null
          grace_months: number | null
          id: string
          kind: Database["public"]["Enums"]["loan_restructure_kind"]
          loan_id: string
          new_interest_rate: number | null
          new_term_months: number | null
          request_note: string
          requested_at: string
          requested_by: string
          requested_by_email: string | null
          status: Database["public"]["Enums"]["loan_restructure_status"]
          updated_at: string
          write_off_amount: number | null
        }
        SetofOptions: {
          from: "*"
          to: "loan_restructures"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_loan_settlement: {
        Args: {
          _actor_id?: string
          _approve: boolean
          _note: string
          _request_id: string
        }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_email: string | null
          decision_note: string | null
          id: string
          loan_id: string
          member_note: string | null
          quote: Json
          quoted_total: number
          requested_at: string
          settle_on: string
          status: Database["public"]["Enums"]["settlement_request_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "loan_settlement_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_savings_deposit: {
        Args: {
          _actor_id: string
          _approve: boolean
          _id: string
          _note: string
        }
        Returns: {
          account_id: string
          amount: number
          channel: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          note: string | null
          payment_reference: string | null
          ref: string
          status: string
          txn_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_deposit_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_log_recycle_bin_entries: {
        Args: { _ids: string[] }
        Returns: number
      }
      disburse_loan: {
        Args: {
          _actor_id: string
          _channel: string
          _loan_id: string
          _note: string
        }
        Returns: {
          amount: number
          arrears_amount: number
          arrears_bucket: string
          arrears_refreshed_at: string | null
          created_at: string
          days_past_due: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          disbursed_at: string | null
          disbursed_by: string | null
          disbursement_account_id: string | null
          disbursement_channel: string | null
          disbursement_note: string | null
          disbursement_reference: string | null
          disbursement_requested_at: string | null
          disbursement_requested_by: string | null
          disbursement_status: string
          first_payment_at: string | null
          id: string
          interest_rate: number
          interest_start_at: string | null
          maturity_at: string | null
          monthly_payment: number | null
          outstanding_principal: number
          penalty_accrued: number
          penalty_paid: number
          product: string
          product_id: string | null
          purpose: string | null
          ref: string
          restructure_count: number
          restructured_at: string | null
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
          user_id: string
          written_off_amount: number | null
          written_off_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "loans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      execute_dividend_run: {
        Args: { _actor_id: string; _run_id: string }
        Returns: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          executed_at: string | null
          executed_by: string | null
          id: string
          members_paid: number
          note: string | null
          per_unit_amount: number
          period_end: string
          period_start: string
          product_id: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          total_paid: number
          units_paid: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dividend_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_transaction: {
        Args: {
          _actor_id: string
          _note: string
          _status: Database["public"]["Enums"]["txn_status"]
          _txn_id: string
        }
        Returns: {
          amount: number
          channel: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["txn_kind"]
          loan_id: string | null
          note: string | null
          ref: string
          savings_account_id: string | null
          status: Database["public"]["Enums"]["txn_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_cron_run: {
        Args: {
          _error?: string
          _metrics?: Json
          _run_id: string
          _status: string
        }
        Returns: {
          attempt: number
          caller: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          job: string
          metrics: Json
          run_key: string
          started_at: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cron_job_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gen_support_ref: { Args: never; Returns: string }
      gen_txn_ref: { Args: { _prefix: string }; Returns: string }
      grant_super_admin_by_email:
        | {
            Args: { _email: string; _note?: string }
            Returns: {
              email: string
              granted_at: string
              user_id: string
            }[]
          }
        | {
            Args: { _actor_id?: string; _email: string; _note?: string }
            Returns: {
              email: string
              granted_at: string
              user_id: string
            }[]
          }
      has_permission_for: {
        Args: { _action: string; _module: string }
        Returns: boolean
      }
      kyc_vault_purge_candidates: {
        Args: { _limit?: number }
        Returns: {
          deleted_at: string
          entity_id: string
          id: string
          payload: Json
          purge_after: string
        }[]
      }
      list_super_admins:
        | {
            Args: never
            Returns: {
              email: string
              full_name: string
              granted_at: string
              granted_by: string
              granted_by_email: string
              member_no: string
              seeded: boolean
              user_id: string
            }[]
          }
        | {
            Args: { _actor_id?: string }
            Returns: {
              email: string
              full_name: string
              granted_at: string
              granted_by: string
              granted_by_email: string
              member_no: string
              seeded: boolean
              user_id: string
            }[]
          }
      mature_fixed_deposits: { Args: never; Returns: number }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_permissions: {
        Args: never
        Returns: {
          action: string
          module: string
        }[]
      }
      national_id_key: {
        Args: { _type: string; _value: string }
        Returns: string
      }
      next_payment_receipt_no: { Args: never; Returns: string }
      normalize_national_id: {
        Args: { _type: string; _value: string }
        Returns: string
      }
      notify_user: {
        Args: {
          _body?: string
          _category: string
          _dedupe_key?: string
          _link?: string
          _meta?: Json
          _title: string
          _user_id: string
        }
        Returns: string
      }
      open_fixed_deposit: {
        Args: {
          _account_id: string
          _actor_id?: string
          _amount: number
          _product_id: string
          _rollover: string
        }
        Returns: {
          break_reason: string | null
          broken_at: string | null
          close_txn_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          interest_expected: number
          interest_paid: number
          maturity_date: string
          open_txn_id: string | null
          penalty_amount: number
          principal: number
          product_id: string
          rate_annual: number
          ref: string
          rollover: string
          source_account_id: string
          start_date: string
          status: Database["public"]["Enums"]["fixed_deposit_status"]
          term_months: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "fixed_deposits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pay_expense: {
        Args: {
          _actor_id: string
          _channel: string
          _expense_id: string
          _reference: string
        }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category_code: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          incurred_on: string
          notes: string | null
          paid_on: string | null
          paid_txn_id: string | null
          payment_channel: string | null
          ref: string
          reference: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          vendor: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pay_pot_payout: {
        Args: { _actor_id: string; _payout_id: string }
        Returns: {
          amount: number
          created_at: string
          cycle: number
          id: string
          note: string | null
          paid_at: string | null
          paid_by: string | null
          pot_id: string
          profile_id: string
          savings_account_id: string | null
          status: Database["public"]["Enums"]["pot_payout_status"]
          txn_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "group_pot_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pay_savings_withdrawal: {
        Args: { _actor_id: string; _id: string }
        Returns: {
          account_id: string
          amount: number
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          balance_at_request: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          channel: string
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          reason: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["withdrawal_request_status"]
          txn_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_withdrawal_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_savings_hold: {
        Args: {
          _account_id: string
          _actor_id: string
          _actor_role: string
          _amount: number
          _loan_id: string
          _reason: string
        }
        Returns: {
          account_id: string
          amount: number
          created_at: string
          created_by: string | null
          created_by_role: string | null
          id: string
          loan_id: string | null
          reason: string
          release_reason: string | null
          released_at: string | null
          released_by: string | null
          status: Database["public"]["Enums"]["savings_hold_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_balance_adjustment: {
        Args: {
          _account_id: string
          _actor_id: string
          _amount: number
          _direction: Database["public"]["Enums"]["adjustment_direction"]
          _reason: string
        }
        Returns: {
          amount: number
          approved_by: string | null
          created_at: string
          direction: Database["public"]["Enums"]["adjustment_direction"]
          id: string
          reason: string
          ref: string
          reference_txn_id: string | null
          savings_account_id: string
          txn_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "balance_adjustments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_expense: {
        Args: {
          _actor_id: string
          _amount: number
          _category_code: string
          _incurred_on: string
          _notes: string
          _payment_channel: string
          _reference: string
          _vendor: string
        }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category_code: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          incurred_on: string
          notes: string | null
          paid_on: string | null
          paid_txn_id: string | null
          payment_channel: string | null
          ref: string
          reference: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          vendor: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_savings_contribution: {
        Args: {
          _account_id: string
          _actor_id: string
          _amount: number
          _channel: string
          _note: string
        }
        Returns: string
      }
      post_savings_interest: {
        Args: {
          _actor?: string
          _dry_run?: boolean
          _note?: string
          _period_end?: string
        }
        Returns: {
          accounts_credited: number
          accounts_processed: number
          dry_run: boolean
          period_end: string
          period_start: string
          run_id: string
          total_interest: number
        }[]
      }
      post_savings_withdrawal: {
        Args: {
          _account_id: string
          _actor_id: string
          _amount: number
          _channel: string
          _note: string
        }
        Returns: string
      }
      post_transfer: {
        Args: {
          _actor_id: string
          _amount: number
          _channel: string
          _from: string
          _note: string
          _to: string
        }
        Returns: {
          amount: number
          channel: string | null
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          from_account_id: string
          id: string
          in_txn_id: string | null
          note: string | null
          out_txn_id: string | null
          ref: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_account_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      preview_runtime_log_retention: {
        Args: {
          _error_days?: number
          _info_days?: number
          _warning_days?: number
        }
        Returns: {
          bytes_to_delete: number
          bytes_to_keep: number
          cutoff: string
          retention_days: number
          rows_to_delete: number
          rows_to_keep: number
          rows_total: number
          severity: string
        }[]
      }
      purchase_shares: {
        Args: {
          _actor_id: string
          _note: string
          _product_id: string
          _savings_account_id: string
          _units: number
        }
        Returns: {
          actor_id: string | null
          amount: number
          created_at: string
          dividend_run_id: string | null
          holding_id: string
          id: string
          kind: Database["public"]["Enums"]["share_txn_kind"]
          note: string | null
          product_id: string
          ref: string
          savings_account_id: string | null
          txn_id: string | null
          unit_price: number
          units: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "share_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purge_audit_log: { Args: { _before: string }; Returns: number }
      purge_notifications: {
        Args: { _before?: string; _scope?: string }
        Returns: number
      }
      purge_recycle_bin: { Args: { _all?: boolean }; Returns: number }
      purge_runtime_error_logs: { Args: { _manual?: boolean }; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reapply_kyc_vault_retention: { Args: never; Returns: number }
      record_loan_repayment: {
        Args: {
          _actor_id: string
          _amount: number
          _channel: string
          _loan_id: string
          _note: string
        }
        Returns: {
          amount: number
          arrears_amount: number
          arrears_bucket: string
          arrears_refreshed_at: string | null
          created_at: string
          days_past_due: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          disbursed_at: string | null
          disbursed_by: string | null
          disbursement_account_id: string | null
          disbursement_channel: string | null
          disbursement_note: string | null
          disbursement_reference: string | null
          disbursement_requested_at: string | null
          disbursement_requested_by: string | null
          disbursement_status: string
          first_payment_at: string | null
          id: string
          interest_rate: number
          interest_start_at: string | null
          maturity_at: string | null
          monthly_payment: number | null
          outstanding_principal: number
          penalty_accrued: number
          penalty_paid: number
          product: string
          product_id: string | null
          purpose: string | null
          ref: string
          restructure_count: number
          restructured_at: string | null
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
          user_id: string
          written_off_amount: number | null
          written_off_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "loans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_login_event: {
        Args: { _method: string; _user_agent: string }
        Returns: undefined
      }
      recycle_notifications: {
        Args: { _before?: string; _retention_days?: number; _scope?: string }
        Returns: number
      }
      refresh_loan_arrears: { Args: never; Returns: Json }
      register_entity: {
        Args: {
          _address_line: string
          _contact_email: string
          _contact_phone: string
          _digital_address: string
          _name: string
          _parent_entity_id: string
          _region: string
          _registration_no: string
          _tax_id: string
          _type: Database["public"]["Enums"]["entity_type"]
        }
        Returns: {
          address_line: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          digital_address: string | null
          id: string
          kyc_notes: string | null
          name: string
          parent_entity_id: string | null
          region: string | null
          registration_no: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tax_id: string | null
          type: Database["public"]["Enums"]["entity_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "entities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_dividend_run: {
        Args: { _actor_id: string; _reason: string; _run_id: string }
        Returns: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          executed_at: string | null
          executed_by: string | null
          id: string
          members_paid: number
          note: string | null
          per_unit_amount: number
          period_end: string
          period_start: string
          product_id: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          total_paid: number
          units_paid: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dividend_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_expense: {
        Args: { _actor_id: string; _expense_id: string; _reason: string }
        Returns: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category_code: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          incurred_on: string
          notes: string | null
          paid_on: string | null
          paid_txn_id: string | null
          payment_channel: string | null
          ref: string
          reference: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          vendor: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_savings_withdrawal: {
        Args: { _actor_id: string; _id: string; _reason: string }
        Returns: {
          account_id: string
          amount: number
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          balance_at_request: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          channel: string
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          reason: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["withdrawal_request_status"]
          txn_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_withdrawal_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_settings_change: {
        Args: { _id: string; _reason: string }
        Returns: {
          applied_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["settings_change_kind"]
          payload: Json
          requested_at: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["settings_change_status"]
          summary: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "settings_change_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_transfer: {
        Args: { _actor_id: string; _reason: string; _transfer_id: string }
        Returns: {
          amount: number
          channel: string | null
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          from_account_id: string
          id: string
          in_txn_id: string | null
          note: string | null
          out_txn_id: string | null
          ref: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_account_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_user:
        | { Args: { _reason: string; _uid: string }; Returns: undefined }
        | {
            Args: { _actor: string; _reason: string; _uid: string }
            Returns: undefined
          }
      release_loan_collateral: {
        Args: { _actor_id: string; _collateral_id: string; _note: string }
        Returns: {
          created_at: string
          created_by: string | null
          currency: string
          description: string
          estimated_value: number
          id: string
          kind: string
          loan_id: string
          reference_no: string | null
          release_note: string | null
          released_at: string | null
          released_by: string | null
          savings_hold_id: string | null
          status: Database["public"]["Enums"]["collateral_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "loan_collateral"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_savings_hold: {
        Args: { _actor_id: string; _id: string; _reason: string }
        Returns: {
          account_id: string
          amount: number
          created_at: string
          created_by: string | null
          created_by_role: string | null
          id: string
          loan_id: string | null
          reason: string
          release_reason: string | null
          released_at: string | null
          released_by: string | null
          status: Database["public"]["Enums"]["savings_hold_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_statement_job_lease: { Args: never; Returns: undefined }
      remove_loan_guarantor: {
        Args: { _actor_id: string; _guarantor_id: string }
        Returns: boolean
      }
      request_loan_disbursement: {
        Args: {
          _channel: string
          _loan_id: string
          _note: string
          _reference: string
          _value_date: string
        }
        Returns: {
          amount: number
          arrears_amount: number
          arrears_bucket: string
          arrears_refreshed_at: string | null
          created_at: string
          days_past_due: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          disbursed_at: string | null
          disbursed_by: string | null
          disbursement_account_id: string | null
          disbursement_channel: string | null
          disbursement_note: string | null
          disbursement_reference: string | null
          disbursement_requested_at: string | null
          disbursement_requested_by: string | null
          disbursement_status: string
          first_payment_at: string | null
          id: string
          interest_rate: number
          interest_start_at: string | null
          maturity_at: string | null
          monthly_payment: number | null
          outstanding_principal: number
          penalty_accrued: number
          penalty_paid: number
          product: string
          product_id: string | null
          purpose: string | null
          ref: string
          restructure_count: number
          restructured_at: string | null
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
          user_id: string
          written_off_amount: number | null
          written_off_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "loans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_loan_restructure: {
        Args: {
          _actor_id: string
          _grace_months: number
          _kind: string
          _loan_id: string
          _new_interest_rate: number
          _new_term_months: number
          _note: string
          _write_off_amount: number
        }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_email: string | null
          decision_note: string | null
          grace_months: number | null
          id: string
          kind: Database["public"]["Enums"]["loan_restructure_kind"]
          loan_id: string
          new_interest_rate: number | null
          new_term_months: number | null
          request_note: string
          requested_at: string
          requested_by: string
          requested_by_email: string | null
          status: Database["public"]["Enums"]["loan_restructure_status"]
          updated_at: string
          write_off_amount: number | null
        }
        SetofOptions: {
          from: "*"
          to: "loan_restructures"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_loan_settlement: {
        Args: {
          _actor_id?: string
          _loan_id: string
          _note: string
          _quote: Json
          _quoted_total: number
          _settle_on: string
        }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_email: string | null
          decision_note: string | null
          id: string
          loan_id: string
          member_note: string | null
          quote: Json
          quoted_total: number
          requested_at: string
          settle_on: string
          status: Database["public"]["Enums"]["settlement_request_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "loan_settlement_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_savings_deposit: {
        Args: {
          _account_id: string
          _amount: number
          _channel: string
          _note: string
          _payment_reference: string
        }
        Returns: {
          account_id: string
          amount: number
          channel: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          note: string | null
          payment_reference: string | null
          ref: string
          status: string
          txn_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_deposit_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_savings_withdrawal: {
        Args: {
          _account_id: string
          _amount: number
          _channel: string
          _reason: string
        }
        Returns: {
          account_id: string
          amount: number
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          balance_at_request: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_role: string | null
          channel: string
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          reason: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["withdrawal_request_status"]
          txn_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_withdrawal_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_settings_change: {
        Args: {
          _kind: Database["public"]["Enums"]["settings_change_kind"]
          _payload: Json
          _summary: string
        }
        Returns: string
      }
      request_transfer: {
        Args: {
          _amount: number
          _from_account_id: string
          _note: string
          _to_account_id: string
        }
        Returns: {
          amount: number
          channel: string | null
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          from_account_id: string
          id: string
          in_txn_id: string | null
          note: string | null
          out_txn_id: string | null
          ref: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_account_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_own_kyc_pending: { Args: never; Returns: undefined }
      restore_audit_log_entries: { Args: { _ids: string[] }; Returns: number }
      restore_recycled_notification: { Args: { _id: string }; Returns: boolean }
      restore_runtime_error_logs: { Args: { _ids: string[] }; Returns: number }
      restore_settings_snapshot: { Args: { _id: string }; Returns: undefined }
      resubmit_own_kyc: { Args: { _note?: string }; Returns: string }
      revoke_super_admin:
        | { Args: { _reason?: string; _user_id: string }; Returns: undefined }
        | {
            Args: { _actor_id?: string; _reason?: string; _user_id: string }
            Returns: undefined
          }
      run_kyc_resubmission_reminders: {
        Args: never
        Returns: {
          deadline_soon: number
          expired: number
          final_day: number
          low_attempts: number
        }[]
      }
      run_loan_arrears_job: {
        Args: { _caller?: string; _run_key?: string }
        Returns: Json
      }
      run_loan_repayment_reminders: {
        Args: { _days_ahead?: number }
        Returns: {
          due_soon: number
          overdue: number
        }[]
      }
      run_recurring_savings_contributions: {
        Args: never
        Returns: {
          error: string
          outcome: string
          schedule_id: string
        }[]
      }
      run_savings_sweeps: {
        Args: never
        Returns: {
          error: string
          outcome: string
          sweep_id: string
        }[]
      }
      savings_held_amount: { Args: { _account_id: string }; Returns: number }
      sell_shares: {
        Args: {
          _actor_id: string
          _note: string
          _product_id: string
          _savings_account_id: string
          _units: number
        }
        Returns: {
          actor_id: string | null
          amount: number
          created_at: string
          dividend_run_id: string | null
          holding_id: string
          id: string
          kind: Database["public"]["Enums"]["share_txn_kind"]
          note: string | null
          product_id: string
          ref: string
          savings_account_id: string | null
          txn_id: string | null
          unit_price: number
          units: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "share_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_approved_loan_terms: {
        Args: { _loan_id: string }
        Returns: {
          amount: number
          arrears_amount: number
          arrears_bucket: string
          arrears_refreshed_at: string | null
          created_at: string
          days_past_due: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          disbursed_at: string | null
          disbursed_by: string | null
          disbursement_account_id: string | null
          disbursement_channel: string | null
          disbursement_note: string | null
          disbursement_reference: string | null
          disbursement_requested_at: string | null
          disbursement_requested_by: string | null
          disbursement_status: string
          first_payment_at: string | null
          id: string
          interest_rate: number
          interest_start_at: string | null
          maturity_at: string | null
          monthly_payment: number | null
          outstanding_principal: number
          penalty_accrued: number
          penalty_paid: number
          product: string
          product_id: string | null
          purpose: string | null
          ref: string
          restructure_count: number
          restructured_at: string | null
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
          user_id: string
          written_off_amount: number | null
          written_off_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "loans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_guarantor_consent: {
        Args: {
          _actor_id: string
          _decision: string
          _guarantor_id: string
          _note: string
        }
        Returns: {
          consent: Database["public"]["Enums"]["guarantor_consent_status"]
          consent_at: string | null
          consent_note: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          guaranteed_amount: number
          id: string
          loan_id: string
          member_id: string | null
          phone: string | null
          relationship: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "loan_guarantors"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_loan_disbursement_account: {
        Args: { _account_id: string; _loan_id: string }
        Returns: undefined
      }
      set_user_active:
        | {
            Args: { _active: boolean; _reason?: string; _uid: string }
            Returns: undefined
          }
        | {
            Args: {
              _active: boolean
              _actor: string
              _reason: string
              _uid: string
            }
            Returns: undefined
          }
      submit_dividend_run_for_approval: {
        Args: { _actor_id: string; _run_id: string }
        Returns: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          executed_at: string | null
          executed_by: string | null
          id: string
          members_paid: number
          note: string | null
          per_unit_amount: number
          period_end: string
          period_start: string
          product_id: string
          ref: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          total_paid: number
          units_paid: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dividend_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_member_loan_repayment: {
        Args: {
          _amount: number
          _channel: string
          _loan_id: string
          _note: string
          _reference: string
        }
        Returns: {
          amount: number
          channel: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["txn_kind"]
          loan_id: string | null
          note: string | null
          ref: string
          savings_account_id: string | null
          status: Database["public"]["Enums"]["txn_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      suspend_entity:
        | {
            Args: { _entity_id: string; _reason: string }
            Returns: {
              address_line: string | null
              contact_email: string | null
              contact_phone: string | null
              created_at: string
              created_by: string | null
              digital_address: string | null
              id: string
              kyc_notes: string | null
              name: string
              parent_entity_id: string | null
              region: string | null
              registration_no: string | null
              reviewed_at: string | null
              reviewed_by: string | null
              status: Database["public"]["Enums"]["entity_status"]
              tax_id: string | null
              type: Database["public"]["Enums"]["entity_type"]
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "entities"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { _actor_id?: string; _entity_id: string; _reason: string }
            Returns: {
              address_line: string | null
              contact_email: string | null
              contact_phone: string | null
              created_at: string
              created_by: string | null
              digital_address: string | null
              id: string
              kyc_notes: string | null
              name: string
              parent_entity_id: string | null
              region: string | null
              registration_no: string | null
              reviewed_at: string | null
              reviewed_by: string | null
              status: Database["public"]["Enums"]["entity_status"]
              tax_id: string | null
              type: Database["public"]["Enums"]["entity_type"]
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "entities"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      transfer_shares: {
        Args: {
          _actor_id: string
          _note: string
          _product_id: string
          _to_member_no: string
          _units: number
        }
        Returns: {
          in_txn_id: string
          out_txn_id: string
          to_full_name: string
          to_user_id: string
        }[]
      }
      upsert_fx_rate: {
        Args: { _base: string; _quote: string; _rate: number }
        Returns: undefined
      }
      waive_loan_penalty: {
        Args: { _actor_id: string; _note: string; _penalty_id: string }
        Returns: {
          amount: number
          created_at: string
          days_late: number
          id: string
          loan_id: string
          period_month: string
          reason: string
          repayment_id: string | null
          updated_at: string
          waive_note: string | null
          waived_at: string | null
          waived_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "loan_penalties"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      adjustment_direction: "credit" | "debit"
      app_role:
        | "super_admin"
        | "compliance_officer"
        | "loan_officer"
        | "finance_officer"
        | "auditor"
        | "member"
        | "admin"
        | "manager"
        | "teller"
        | "support_officer"
      collateral_status: "pledged" | "released" | "seized"
      entity_role: "owner" | "admin" | "member"
      entity_status: "pending" | "active" | "suspended" | "closed"
      entity_type: "group" | "department" | "institution"
      expense_status: "pending" | "approved" | "paid" | "rejected"
      fixed_deposit_status: "active" | "matured" | "redeemed" | "broken"
      guarantor_consent_status: "pending" | "accepted" | "declined" | "revoked"
      kyc_doc_status: "pending" | "approved" | "rejected"
      kyc_doc_type:
        | "national_id_front"
        | "national_id_back"
        | "selfie"
        | "proof_of_address"
        | "other"
        | "guardian_consent"
        | "safeguarding_attestation"
      kyc_notification_channel: "email" | "sms"
      kyc_status: "pending" | "active" | "rejected"
      loan_restructure_kind: "reschedule" | "grace_period" | "write_off"
      loan_restructure_status: "pending" | "approved" | "rejected"
      loan_status: "pending" | "approved" | "rejected" | "active" | "closed"
      member_tier: "standard" | "premium"
      pot_payout_status: "scheduled" | "paid" | "skipped"
      recurring_frequency: "daily" | "weekly" | "monthly"
      recurring_status: "active" | "paused"
      savings_hold_status: "active" | "released"
      settings_change_kind:
        | "branding"
        | "institution"
        | "role_grant"
        | "role_revoke"
        | "permission_matrix"
        | "payment_config"
      settings_change_status:
        | "pending"
        | "approved"
        | "rejected"
        | "applied"
        | "failed"
      settlement_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
      share_txn_kind: "purchase" | "sale" | "dividend"
      support_category:
        | "savings"
        | "loans"
        | "payments"
        | "kyc"
        | "account"
        | "other"
      support_priority: "low" | "normal" | "high" | "urgent"
      support_status:
        | "open"
        | "in_progress"
        | "awaiting_member"
        | "resolved"
        | "closed"
      transfer_status: "pending" | "cleared" | "failed" | "reversed"
      txn_kind:
        | "deposit"
        | "withdrawal"
        | "loan_disbursement"
        | "loan_repayment"
        | "fee"
        | "interest"
        | "transfer_out"
        | "transfer_in"
        | "adjustment"
        | "expense"
      txn_status: "cleared" | "pending" | "failed"
      withdrawal_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "paid"
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
      adjustment_direction: ["credit", "debit"],
      app_role: [
        "super_admin",
        "compliance_officer",
        "loan_officer",
        "finance_officer",
        "auditor",
        "member",
        "admin",
        "manager",
        "teller",
        "support_officer",
      ],
      collateral_status: ["pledged", "released", "seized"],
      entity_role: ["owner", "admin", "member"],
      entity_status: ["pending", "active", "suspended", "closed"],
      entity_type: ["group", "department", "institution"],
      expense_status: ["pending", "approved", "paid", "rejected"],
      fixed_deposit_status: ["active", "matured", "redeemed", "broken"],
      guarantor_consent_status: ["pending", "accepted", "declined", "revoked"],
      kyc_doc_status: ["pending", "approved", "rejected"],
      kyc_doc_type: [
        "national_id_front",
        "national_id_back",
        "selfie",
        "proof_of_address",
        "other",
        "guardian_consent",
        "safeguarding_attestation",
      ],
      kyc_notification_channel: ["email", "sms"],
      kyc_status: ["pending", "active", "rejected"],
      loan_restructure_kind: ["reschedule", "grace_period", "write_off"],
      loan_restructure_status: ["pending", "approved", "rejected"],
      loan_status: ["pending", "approved", "rejected", "active", "closed"],
      member_tier: ["standard", "premium"],
      pot_payout_status: ["scheduled", "paid", "skipped"],
      recurring_frequency: ["daily", "weekly", "monthly"],
      recurring_status: ["active", "paused"],
      savings_hold_status: ["active", "released"],
      settings_change_kind: [
        "branding",
        "institution",
        "role_grant",
        "role_revoke",
        "permission_matrix",
        "payment_config",
      ],
      settings_change_status: [
        "pending",
        "approved",
        "rejected",
        "applied",
        "failed",
      ],
      settlement_request_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
      ],
      share_txn_kind: ["purchase", "sale", "dividend"],
      support_category: [
        "savings",
        "loans",
        "payments",
        "kyc",
        "account",
        "other",
      ],
      support_priority: ["low", "normal", "high", "urgent"],
      support_status: [
        "open",
        "in_progress",
        "awaiting_member",
        "resolved",
        "closed",
      ],
      transfer_status: ["pending", "cleared", "failed", "reversed"],
      txn_kind: [
        "deposit",
        "withdrawal",
        "loan_disbursement",
        "loan_repayment",
        "fee",
        "interest",
        "transfer_out",
        "transfer_in",
        "adjustment",
        "expense",
      ],
      txn_status: ["cleared", "pending", "failed"],
      withdrawal_request_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "paid",
      ],
    },
  },
} as const
