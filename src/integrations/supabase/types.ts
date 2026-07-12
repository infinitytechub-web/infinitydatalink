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
      loan_repayments: {
        Row: {
          created_at: string
          due_date: string
          id: string
          installment_no: number
          interest_due: number
          loan_id: string
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
          id?: string
          installment_no: number
          interest_due: number
          loan_id: string
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
          id?: string
          installment_no?: number
          interest_due?: number
          loan_id?: string
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
      loans: {
        Row: {
          amount: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          disbursed_at: string | null
          disbursed_by: string | null
          first_payment_at: string | null
          id: string
          interest_rate: number
          maturity_at: string | null
          monthly_payment: number | null
          outstanding_principal: number
          product: string
          purpose: string | null
          ref: string
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          disbursed_at?: string | null
          disbursed_by?: string | null
          first_payment_at?: string | null
          id?: string
          interest_rate?: number
          maturity_at?: string | null
          monthly_payment?: number | null
          outstanding_principal?: number
          product: string
          purpose?: string | null
          ref: string
          status?: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          disbursed_at?: string | null
          disbursed_by?: string | null
          first_payment_at?: string | null
          id?: string
          interest_rate?: number
          maturity_at?: string | null
          monthly_payment?: number | null
          outstanding_principal?: number
          product?: string
          purpose?: string | null
          ref?: string
          status?: Database["public"]["Enums"]["loan_status"]
          term_months?: number
          updated_at?: string
          user_id?: string
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
          phone: string | null
          relationship: string
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
          phone?: string | null
          relationship: string
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
          phone?: string | null
          relationship?: string
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
      profiles: {
        Row: {
          address_line: string | null
          created_at: string
          date_of_birth: string | null
          digital_address: string | null
          employer: string | null
          full_name: string | null
          gender: string | null
          id: string
          kyc: Database["public"]["Enums"]["kyc_status"]
          kyc_assigned_at: string | null
          kyc_assigned_to: string | null
          kyc_notes: string | null
          kyc_reviewed_at: string | null
          kyc_reviewed_by: string | null
          member_no: string | null
          national_id: string | null
          occupation: string | null
          phone: string | null
          region: string | null
          tier: Database["public"]["Enums"]["member_tier"]
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          created_at?: string
          date_of_birth?: string | null
          digital_address?: string | null
          employer?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          kyc?: Database["public"]["Enums"]["kyc_status"]
          kyc_assigned_at?: string | null
          kyc_assigned_to?: string | null
          kyc_notes?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          member_no?: string | null
          national_id?: string | null
          occupation?: string | null
          phone?: string | null
          region?: string | null
          tier?: Database["public"]["Enums"]["member_tier"]
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          created_at?: string
          date_of_birth?: string | null
          digital_address?: string | null
          employer?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          kyc?: Database["public"]["Enums"]["kyc_status"]
          kyc_assigned_at?: string | null
          kyc_assigned_to?: string | null
          kyc_notes?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          member_no?: string | null
          national_id?: string | null
          occupation?: string | null
          phone?: string | null
          region?: string | null
          tier?: Database["public"]["Enums"]["member_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      savings_accounts: {
        Row: {
          balance: number
          created_at: string
          goal_amount: number | null
          goal_target_date: string | null
          id: string
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
          goal_target_date?: string | null
          id?: string
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
          goal_target_date?: string | null
          id?: string
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
        ]
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
      approve_entity: {
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
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
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          disbursed_at: string | null
          disbursed_by: string | null
          first_payment_at: string | null
          id: string
          interest_rate: number
          maturity_at: string | null
          monthly_payment: number | null
          outstanding_principal: number
          product: string
          purpose: string | null
          ref: string
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
          user_id: string
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
      gen_txn_ref: { Args: { _prefix: string }; Returns: string }
      grant_super_admin_by_email: {
        Args: { _email: string; _note?: string }
        Returns: {
          email: string
          granted_at: string
          user_id: string
        }[]
      }
      list_super_admins: {
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
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
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
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
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          disbursed_at: string | null
          disbursed_by: string | null
          first_payment_at: string | null
          id: string
          interest_rate: number
          maturity_at: string | null
          monthly_payment: number | null
          outstanding_principal: number
          product: string
          purpose: string | null
          ref: string
          status: Database["public"]["Enums"]["loan_status"]
          term_months: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "loans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      reset_own_kyc_pending: { Args: never; Returns: undefined }
      revoke_super_admin: {
        Args: { _reason?: string; _user_id: string }
        Returns: undefined
      }
      suspend_entity: {
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
      entity_role: "owner" | "admin" | "member"
      entity_status: "pending" | "active" | "suspended" | "closed"
      entity_type: "group" | "department" | "institution"
      expense_status: "pending" | "approved" | "paid" | "rejected"
      kyc_doc_status: "pending" | "approved" | "rejected"
      kyc_doc_type:
        | "national_id_front"
        | "national_id_back"
        | "selfie"
        | "proof_of_address"
        | "other"
      kyc_notification_channel: "email" | "sms"
      kyc_status: "pending" | "active" | "rejected"
      loan_status: "pending" | "approved" | "rejected" | "active" | "closed"
      member_tier: "standard" | "premium"
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
      adjustment_direction: ["credit", "debit"],
      app_role: [
        "super_admin",
        "compliance_officer",
        "loan_officer",
        "finance_officer",
        "auditor",
        "member",
      ],
      entity_role: ["owner", "admin", "member"],
      entity_status: ["pending", "active", "suspended", "closed"],
      entity_type: ["group", "department", "institution"],
      expense_status: ["pending", "approved", "paid", "rejected"],
      kyc_doc_status: ["pending", "approved", "rejected"],
      kyc_doc_type: [
        "national_id_front",
        "national_id_back",
        "selfie",
        "proof_of_address",
        "other",
      ],
      kyc_notification_channel: ["email", "sms"],
      kyc_status: ["pending", "active", "rejected"],
      loan_status: ["pending", "approved", "rejected", "active", "closed"],
      member_tier: ["standard", "premium"],
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
    },
  },
} as const
