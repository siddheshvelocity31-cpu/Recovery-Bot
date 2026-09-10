export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      allocation: {
        Row: {
          amount_paise: number
          created_at: string
          credit_entry_id: string | null
          id: string
          open_item_id: string
          receipt_id: string | null
        }
        Insert: {
          amount_paise: number
          created_at?: string
          credit_entry_id?: string | null
          id?: string
          open_item_id: string
          receipt_id?: string | null
        }
        Update: {
          amount_paise?: number
          created_at?: string
          credit_entry_id?: string | null
          id?: string
          open_item_id?: string
          receipt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allocation_credit_entry_id_fkey"
            columns: ["credit_entry_id"]
            isOneToOne: true
            referencedRelation: "ledger_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_open_item_id_fkey"
            columns: ["open_item_id"]
            isOneToOne: false
            referencedRelation: "open_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipt"
            referencedColumns: ["id"]
          },
        ]
      }
      app_user: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      cadence_policy: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          max_messages_per_week: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_messages_per_week?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          max_messages_per_week?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_policy_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_step: {
        Row: {
          cadence_policy_id: string
          channel: Database["public"]["Enums"]["channel"]
          created_at: string
          escalation_level: number
          id: string
          offset_days_from_due: number
          step_number: number
          template_key: string
        }
        Insert: {
          cadence_policy_id: string
          channel: Database["public"]["Enums"]["channel"]
          created_at?: string
          escalation_level?: number
          id?: string
          offset_days_from_due: number
          step_number: number
          template_key: string
        }
        Update: {
          cadence_policy_id?: string
          channel?: Database["public"]["Enums"]["channel"]
          created_at?: string
          escalation_level?: number
          id?: string
          offset_days_from_due?: number
          step_number?: number
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_step_cadence_policy_id_fkey"
            columns: ["cadence_policy_id"]
            isOneToOne: false
            referencedRelation: "cadence_policy"
            referencedColumns: ["id"]
          },
        ]
      }
      category: {
        Row: {
          behaviour_band: Database["public"]["Enums"]["behaviour_band"]
          code: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          is_default: boolean
          relationship_tier: Database["public"]["Enums"]["relationship_tier"]
          updated_at: string
        }
        Insert: {
          behaviour_band: Database["public"]["Enums"]["behaviour_band"]
          code: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          relationship_tier: Database["public"]["Enums"]["relationship_tier"]
          updated_at?: string
        }
        Update: {
          behaviour_band?: Database["public"]["Enums"]["behaviour_band"]
          code?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          relationship_tier?: Database["public"]["Enums"]["relationship_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      client: {
        Row: {
          assigned_collector_id: string | null
          behaviour_band: Database["public"]["Enums"]["behaviour_band"]
          category_id: string | null
          client_code: string
          cost_center: string | null
          created_at: string
          credit_terms_days: number
          id: string
          is_muted: boolean
          mute_reason: string | null
          muted_until: string | null
          name: string
          relationship_tier: Database["public"]["Enums"]["relationship_tier"]
          tier_changed_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_collector_id?: string | null
          behaviour_band?: Database["public"]["Enums"]["behaviour_band"]
          category_id?: string | null
          client_code: string
          cost_center?: string | null
          created_at?: string
          credit_terms_days?: number
          id?: string
          is_muted?: boolean
          mute_reason?: string | null
          muted_until?: string | null
          name: string
          relationship_tier?: Database["public"]["Enums"]["relationship_tier"]
          tier_changed_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_collector_id?: string | null
          behaviour_band?: Database["public"]["Enums"]["behaviour_band"]
          category_id?: string | null
          client_code?: string
          cost_center?: string | null
          created_at?: string
          credit_terms_days?: number
          id?: string
          is_muted?: boolean
          mute_reason?: string | null
          muted_until?: string | null
          name?: string
          relationship_tier?: Database["public"]["Enums"]["relationship_tier"]
          tier_changed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assigned_collector_id_fkey"
            columns: ["assigned_collector_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
        ]
      }
      commitment: {
        Row: {
          case_id: string
          confidence: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          due_at: string | null
          extraction_model: string | null
          id: string
          promised_amount_paise: number | null
          promised_on: string | null
          reply_id: string | null
          status: Database["public"]["Enums"]["commitment_status"]
          updated_at: string
        }
        Insert: {
          case_id: string
          confidence?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          due_at?: string | null
          extraction_model?: string | null
          id?: string
          promised_amount_paise?: number | null
          promised_on?: string | null
          reply_id?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          updated_at?: string
        }
        Update: {
          case_id?: string
          confidence?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          due_at?: string | null
          extraction_model?: string | null
          id?: string
          promised_amount_paise?: number | null
          promised_on?: string | null
          reply_id?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitment_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "recovery_case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "reply"
            referencedColumns: ["id"]
          },
        ]
      }
      contact: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          email_opt_in: boolean
          escalation_level: number
          full_name: string
          id: string
          is_primary: boolean
          phone_e164: string | null
          role_title: string | null
          updated_at: string
          voice_opt_in: boolean
          whatsapp_opt_in: boolean
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          email_opt_in?: boolean
          escalation_level?: number
          full_name: string
          id?: string
          is_primary?: boolean
          phone_e164?: string | null
          role_title?: string | null
          updated_at?: string
          voice_opt_in?: boolean
          whatsapp_opt_in?: boolean
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          email_opt_in?: boolean
          escalation_level?: number
          full_name?: string
          id?: string
          is_primary?: boolean
          phone_e164?: string | null
          role_title?: string | null
          updated_at?: string
          voice_opt_in?: boolean
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contact_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      event: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          case_id: string | null
          client_id: string
          id: string
          occurred_at: string
          payload: Json
          type: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          case_id?: string | null
          client_id: string
          id?: string
          occurred_at?: string
          payload?: Json
          type: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          case_id?: string | null
          client_id?: string
          id?: string
          occurred_at?: string
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      flag: {
        Row: {
          ack_reason: string | null
          ack_until: string | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          client_id: string
          created_at: string
          dedupe_key: string
          id: string
          message: string
          open_item_id: string | null
          raised_at: string
          resolution: string | null
          resolved_at: string | null
          rule: Database["public"]["Enums"]["flag_rule"]
          severity: Database["public"]["Enums"]["flag_severity"]
        }
        Insert: {
          ack_reason?: string | null
          ack_until?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          client_id: string
          created_at?: string
          dedupe_key: string
          id?: string
          message: string
          open_item_id?: string | null
          raised_at?: string
          resolution?: string | null
          resolved_at?: string | null
          rule: Database["public"]["Enums"]["flag_rule"]
          severity: Database["public"]["Enums"]["flag_severity"]
        }
        Update: {
          ack_reason?: string | null
          ack_until?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          client_id?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          message?: string
          open_item_id?: string | null
          raised_at?: string
          resolution?: string | null
          resolved_at?: string | null
          rule?: Database["public"]["Enums"]["flag_rule"]
          severity?: Database["public"]["Enums"]["flag_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "flag_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flag_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flag_open_item_id_fkey"
            columns: ["open_item_id"]
            isOneToOne: false
            referencedRelation: "open_item"
            referencedColumns: ["id"]
          },
        ]
      }
      job: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          run_after?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: []
      }
      ledger_entry: {
        Row: {
          airline: string | null
          bill_amount_paise: number | null
          client_id: string
          created_at: string
          doc_code: string
          doc_date: string
          emp_code: string | null
          entry_type: Database["public"]["Enums"]["entry_type"]
          id: string
          ledger_import_id: string
          narration: string | null
          natural_key: string
          pax_name: string | null
          pnr: string | null
          raw_row: Json
          reference: string | null
          remarks: string | null
          row_number: number
          sector: string | null
          ticket_no: string | null
          travel_date: string | null
        }
        Insert: {
          airline?: string | null
          bill_amount_paise?: number | null
          client_id: string
          created_at?: string
          doc_code: string
          doc_date: string
          emp_code?: string | null
          entry_type: Database["public"]["Enums"]["entry_type"]
          id?: string
          ledger_import_id: string
          narration?: string | null
          natural_key: string
          pax_name?: string | null
          pnr?: string | null
          raw_row: Json
          reference?: string | null
          remarks?: string | null
          row_number: number
          sector?: string | null
          ticket_no?: string | null
          travel_date?: string | null
        }
        Update: {
          airline?: string | null
          bill_amount_paise?: number | null
          client_id?: string
          created_at?: string
          doc_code?: string
          doc_date?: string
          emp_code?: string | null
          entry_type?: Database["public"]["Enums"]["entry_type"]
          id?: string
          ledger_import_id?: string
          narration?: string | null
          natural_key?: string
          pax_name?: string | null
          pnr?: string | null
          raw_row?: Json
          reference?: string | null
          remarks?: string | null
          row_number?: number
          sector?: string | null
          ticket_no?: string | null
          travel_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entry_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entry_ledger_import_id_fkey"
            columns: ["ledger_import_id"]
            isOneToOne: false
            referencedRelation: "ledger_import"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entry_rejected: {
        Row: {
          created_at: string
          id: string
          ledger_import_id: string
          raw_row: Json
          reason: string
          row_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          ledger_import_id: string
          raw_row: Json
          reason: string
          row_number: number
        }
        Update: {
          created_at?: string
          id?: string
          ledger_import_id?: string
          raw_row?: Json
          reason?: string
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entry_rejected_ledger_import_id_fkey"
            columns: ["ledger_import_id"]
            isOneToOne: false
            referencedRelation: "ledger_import"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_import: {
        Row: {
          client_id: string
          closing_balance_paise: number | null
          completed_at: string | null
          created_at: string
          cursor_row: number
          error_message: string | null
          file_sha256: string
          id: string
          opening_balance_paise: number | null
          period_from: string | null
          period_to: string | null
          row_count_imported: number
          row_count_rejected: number
          row_count_total: number | null
          source_filename: string
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          client_id: string
          closing_balance_paise?: number | null
          completed_at?: string | null
          created_at?: string
          cursor_row?: number
          error_message?: string | null
          file_sha256: string
          id?: string
          opening_balance_paise?: number | null
          period_from?: string | null
          period_to?: string | null
          row_count_imported?: number
          row_count_rejected?: number
          row_count_total?: number | null
          source_filename: string
          status?: Database["public"]["Enums"]["import_status"]
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          client_id?: string
          closing_balance_paise?: number | null
          completed_at?: string | null
          created_at?: string
          cursor_row?: number
          error_message?: string | null
          file_sha256?: string
          id?: string
          opening_balance_paise?: number | null
          period_from?: string | null
          period_to?: string | null
          row_count_imported?: number
          row_count_rejected?: number
          row_count_total?: number | null
          source_filename?: string
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_import_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_import_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      open_item: {
        Row: {
          aging_bucket: Database["public"]["Enums"]["aging_bucket"]
          client_id: string
          created_at: string
          credits_applied_paise: number
          dispute_reason: string | null
          due_date: string | null
          gross_amount_paise: number
          id: string
          is_unaged: boolean
          issue_date: string
          open_amount_paise: number | null
          receipts_applied_paise: number
          source_doc_code: string
          source_reference: string | null
          status: Database["public"]["Enums"]["open_item_status"]
          updated_at: string
        }
        Insert: {
          aging_bucket?: Database["public"]["Enums"]["aging_bucket"]
          client_id: string
          created_at?: string
          credits_applied_paise?: number
          dispute_reason?: string | null
          due_date?: string | null
          gross_amount_paise: number
          id?: string
          is_unaged?: boolean
          issue_date: string
          open_amount_paise?: number | null
          receipts_applied_paise?: number
          source_doc_code: string
          source_reference?: string | null
          status?: Database["public"]["Enums"]["open_item_status"]
          updated_at?: string
        }
        Update: {
          aging_bucket?: Database["public"]["Enums"]["aging_bucket"]
          client_id?: string
          created_at?: string
          credits_applied_paise?: number
          dispute_reason?: string | null
          due_date?: string | null
          gross_amount_paise?: number
          id?: string
          is_unaged?: boolean
          issue_date?: string
          open_amount_paise?: number | null
          receipts_applied_paise?: number
          source_doc_code?: string
          source_reference?: string | null
          status?: Database["public"]["Enums"]["open_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_item_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach: {
        Row: {
          cadence_step_number: number
          case_id: string
          channel: Database["public"]["Enums"]["channel"]
          client_id: string
          contact_id: string | null
          cost_paise: number | null
          created_at: string
          delivered_at: string | null
          failed_reason: string | null
          id: string
          idempotency_key: string
          is_dry_run: boolean
          persona_tone: Database["public"]["Enums"]["tone"]
          provider: string | null
          provider_message_id: string | null
          read_at: string | null
          rendered_body: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["outreach_status"]
          suppression_reason: string | null
          template_key: string
          updated_at: string
        }
        Insert: {
          cadence_step_number: number
          case_id: string
          channel: Database["public"]["Enums"]["channel"]
          client_id: string
          contact_id?: string | null
          cost_paise?: number | null
          created_at?: string
          delivered_at?: string | null
          failed_reason?: string | null
          id?: string
          idempotency_key: string
          is_dry_run?: boolean
          persona_tone: Database["public"]["Enums"]["tone"]
          provider?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          rendered_body: string
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outreach_status"]
          suppression_reason?: string | null
          template_key: string
          updated_at?: string
        }
        Update: {
          cadence_step_number?: number
          case_id?: string
          channel?: Database["public"]["Enums"]["channel"]
          client_id?: string
          contact_id?: string | null
          cost_paise?: number | null
          created_at?: string
          delivered_at?: string | null
          failed_reason?: string | null
          id?: string
          idempotency_key?: string
          is_dry_run?: boolean
          persona_tone?: Database["public"]["Enums"]["tone"]
          provider?: string | null
          provider_message_id?: string | null
          read_at?: string | null
          rendered_body?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outreach_status"]
          suppression_reason?: string | null
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "recovery_case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
        ]
      }
      persona: {
        Row: {
          category_id: string
          created_at: string
          id: string
          language: string
          requires_human_approval: boolean
          salutation: string
          signature: string
          tone: Database["public"]["Enums"]["tone"]
          updated_at: string
          voice_script_style: string | null
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          language?: string
          requires_human_approval?: boolean
          salutation?: string
          signature: string
          tone?: Database["public"]["Enums"]["tone"]
          updated_at?: string
          voice_script_style?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          language?: string
          requires_human_approval?: boolean
          salutation?: string
          signature?: string
          tone?: Database["public"]["Enums"]["tone"]
          updated_at?: string
          voice_script_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persona_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt: {
        Row: {
          amount_paise: number
          client_id: string
          created_at: string
          external_ref: string | null
          id: string
          instrument: string | null
          receipt_date: string
          reference: string | null
          unallocated_paise: number
          updated_at: string
        }
        Insert: {
          amount_paise: number
          client_id: string
          created_at?: string
          external_ref?: string | null
          id?: string
          instrument?: string | null
          receipt_date: string
          reference?: string | null
          unallocated_paise: number
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          client_id?: string
          created_at?: string
          external_ref?: string | null
          id?: string
          instrument?: string | null
          receipt_date?: string
          reference?: string | null
          unallocated_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_case: {
        Row: {
          assigned_to: string | null
          client_id: string
          closed_at: string | null
          created_at: string
          current_step_number: number
          id: string
          next_action_at: string | null
          opened_at: string
          status: Database["public"]["Enums"]["case_status"]
          suppressed_until: string | null
          suppression_reason: string | null
          total_open_paise: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id: string
          closed_at?: string | null
          created_at?: string
          current_step_number?: number
          id?: string
          next_action_at?: string | null
          opened_at?: string
          status?: Database["public"]["Enums"]["case_status"]
          suppressed_until?: string | null
          suppression_reason?: string | null
          total_open_paise?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string
          closed_at?: string | null
          created_at?: string
          current_step_number?: number
          id?: string
          next_action_at?: string | null
          opened_at?: string
          status?: Database["public"]["Enums"]["case_status"]
          suppressed_until?: string | null
          suppression_reason?: string | null
          total_open_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_case_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_case_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      reply: {
        Row: {
          case_id: string
          channel: Database["public"]["Enums"]["channel"]
          client_id: string
          created_at: string
          id: string
          outreach_id: string | null
          provider_message_id: string | null
          raw_text: string
          received_at: string
        }
        Insert: {
          case_id: string
          channel: Database["public"]["Enums"]["channel"]
          client_id: string
          created_at?: string
          id?: string
          outreach_id?: string | null
          provider_message_id?: string | null
          raw_text: string
          received_at?: string
        }
        Update: {
          case_id?: string
          channel?: Database["public"]["Enums"]["channel"]
          client_id?: string
          created_at?: string
          id?: string
          outreach_id?: string | null
          provider_message_id?: string | null
          raw_text?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "recovery_case"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_outreach_id_fkey"
            columns: ["outreach_id"]
            isOneToOne: false
            referencedRelation: "outreach"
            referencedColumns: ["id"]
          },
        ]
      }
      setting_change: {
        Row: {
          actor_id: string
          changed_at: string
          field: string
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          scope: string
          scope_id: string | null
        }
        Insert: {
          actor_id: string
          changed_at?: string
          field: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          scope: string
          scope_id?: string | null
        }
        Update: {
          actor_id?: string
          changed_at?: string
          field?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          scope?: string
          scope_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setting_change_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          created_at: string
          global_max_messages_per_week: number
          id: string
          last_tick_at: string | null
          outreach_kill_switch: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          global_max_messages_per_week?: number
          id?: string
          last_tick_at?: string | null
          outreach_kill_switch?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          global_max_messages_per_week?: number
          id?: string
          last_tick_at?: string | null
          outreach_kill_switch?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      threshold_set: {
        Row: {
          amber_amount_paise: number | null
          amber_days: number
          category_id: string
          created_at: string
          id: string
          promise_grace_hours: number
          quiet_hours_end: string
          quiet_hours_start: string
          red_amount_paise: number | null
          red_days: number
          silence_attempts: number
          updated_at: string
        }
        Insert: {
          amber_amount_paise?: number | null
          amber_days?: number
          category_id: string
          created_at?: string
          id?: string
          promise_grace_hours?: number
          quiet_hours_end?: string
          quiet_hours_start?: string
          red_amount_paise?: number | null
          red_days?: number
          silence_attempts?: number
          updated_at?: string
        }
        Update: {
          amber_amount_paise?: number | null
          amber_days?: number
          category_id?: string
          created_at?: string
          id?: string
          promise_grace_hours?: number
          quiet_hours_end?: string
          quiet_hours_start?: string
          red_amount_paise?: number | null
          red_days?: number
          silence_attempts?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threshold_set_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "category"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_jobs: {
        Args: { p_limit: number; p_worker: string }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          run_after: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "job"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fail_job: { Args: { p_error: string; p_id: string }; Returns: undefined }
      get_client_list: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_tier?: string
        }
        Returns: {
          assigned_collector_id: string
          balance_paise: number
          behaviour_band: string
          category_id: string
          client_code: string
          cost_center: string
          created_at: string
          credit_terms_days: number
          id: string
          is_muted: boolean
          last_import_date: string
          mute_reason: string
          muted_until: string
          name: string
          relationship_tier: string
          tier_changed_at: string
          updated_at: string
        }[]
      }
      health_check: { Args: never; Returns: string }
      reclaim_stuck_jobs: { Args: never; Returns: string[] }
    }
    Enums: {
      actor_type: "system" | "user" | "client"
      aging_bucket:
        | "current"
        | "d1_30"
        | "d31_60"
        | "d61_90"
        | "d90_plus"
        | "unknown"
      behaviour_band: "prompt" | "slipping" | "chronic" | "unknown"
      case_status:
        | "open"
        | "awaiting_reply"
        | "promise_active"
        | "escalated"
        | "suppressed"
        | "resolved"
      channel: "whatsapp" | "email" | "voice" | "human"
      commitment_status:
        | "proposed"
        | "confirmed"
        | "kept"
        | "partial"
        | "broken"
        | "rejected"
      entry_type: "debit" | "credit" | "opening"
      flag_rule:
        | "aged_debt"
        | "amount_exposure"
        | "broken_promise"
        | "silence"
        | "adverse_trajectory"
        | "unaged_balance"
      flag_severity: "red" | "amber" | "grey"
      import_status: "pending" | "parsing" | "imported" | "failed"
      job_status: "pending" | "running" | "done" | "failed" | "dead"
      open_item_status:
        | "open"
        | "part_paid"
        | "settled"
        | "disputed"
        | "written_off"
      outreach_status:
        | "queued"
        | "suppressed"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
      relationship_tier: "strategic" | "standard" | "watchlist" | "new"
      tone: "courteous" | "neutral" | "firm"
      user_role: "admin" | "collector" | "viewer"
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
      actor_type: ["system", "user", "client"],
      aging_bucket: [
        "current",
        "d1_30",
        "d31_60",
        "d61_90",
        "d90_plus",
        "unknown",
      ],
      behaviour_band: ["prompt", "slipping", "chronic", "unknown"],
      case_status: [
        "open",
        "awaiting_reply",
        "promise_active",
        "escalated",
        "suppressed",
        "resolved",
      ],
      channel: ["whatsapp", "email", "voice", "human"],
      commitment_status: [
        "proposed",
        "confirmed",
        "kept",
        "partial",
        "broken",
        "rejected",
      ],
      entry_type: ["debit", "credit", "opening"],
      flag_rule: [
        "aged_debt",
        "amount_exposure",
        "broken_promise",
        "silence",
        "adverse_trajectory",
        "unaged_balance",
      ],
      flag_severity: ["red", "amber", "grey"],
      import_status: ["pending", "parsing", "imported", "failed"],
      job_status: ["pending", "running", "done", "failed", "dead"],
      open_item_status: [
        "open",
        "part_paid",
        "settled",
        "disputed",
        "written_off",
      ],
      outreach_status: [
        "queued",
        "suppressed",
        "sent",
        "delivered",
        "read",
        "failed",
      ],
      relationship_tier: ["strategic", "standard", "watchlist", "new"],
      tone: ["courteous", "neutral", "firm"],
      user_role: ["admin", "collector", "viewer"],
    },
  },
} as const

