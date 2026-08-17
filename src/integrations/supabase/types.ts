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
      admin_expenses: {
        Row: {
          categoria: string | null
          created_at: string
          created_by: string | null
          data: string
          descricao: string
          id: string
          notas: string | null
          recorrente: boolean
          updated_at: string
          valor: number
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          descricao: string
          id?: string
          notas?: string | null
          recorrente?: boolean
          updated_at?: string
          valor?: number
        }
        Update: {
          categoria?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          id?: string
          notas?: string | null
          recorrente?: boolean
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      admin_shared_apis: {
        Row: {
          client_id: string
          created_at: string
          enabled: boolean
          id: string
          provider: string
          unipile_account_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          provider: string
          unipile_account_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          provider?: string
          unipile_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_shared_apis_unipile_account_id_fkey"
            columns: ["unipile_account_id"]
            isOneToOne: false
            referencedRelation: "admin_unipile_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_unipile_accounts: {
        Row: {
          active: boolean
          api_key: string
          created_at: string
          dsn: string
          id: string
          label: string
          max_profiles: number
          slot_number: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_key: string
          created_at?: string
          dsn: string
          id?: string
          label?: string
          max_profiles?: number
          slot_number: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_key?: string
          created_at?: string
          dsn?: string
          id?: string
          label?: string
          max_profiles?: number
          slot_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      automation_settings: {
        Row: {
          auto_email_enabled: boolean
          auto_instagram_enabled: boolean
          auto_linkedin_dm_enabled: boolean
          auto_socio_linkedin: boolean
          auto_socio_linkedin_start_cadence: boolean
          auto_telegram_enabled: boolean
          auto_whatsapp_enabled: boolean
          created_at: string
          enabled: boolean
          frequency_hours: number
          id: string
          ig_hashtags: string[]
          ig_target_accounts: string[]
          last_run_at: string | null
          last_run_summary: Json | null
          linkedin_search_terms: string[]
          maps_niches: string[]
          maps_regions: string[]
          max_leads_per_run: number
          min_score_360: number
          next_run_at: string | null
          require_partner_identified: boolean
          require_partner_mobile: boolean
          require_whatsapp_validated: boolean
          run_cnpj_enrich: boolean
          run_dispatch: boolean
          run_instagram: boolean
          run_linkedin: boolean
          run_maps: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_email_enabled?: boolean
          auto_instagram_enabled?: boolean
          auto_linkedin_dm_enabled?: boolean
          auto_socio_linkedin?: boolean
          auto_socio_linkedin_start_cadence?: boolean
          auto_telegram_enabled?: boolean
          auto_whatsapp_enabled?: boolean
          created_at?: string
          enabled?: boolean
          frequency_hours?: number
          id?: string
          ig_hashtags?: string[]
          ig_target_accounts?: string[]
          last_run_at?: string | null
          last_run_summary?: Json | null
          linkedin_search_terms?: string[]
          maps_niches?: string[]
          maps_regions?: string[]
          max_leads_per_run?: number
          min_score_360?: number
          next_run_at?: string | null
          require_partner_identified?: boolean
          require_partner_mobile?: boolean
          require_whatsapp_validated?: boolean
          run_cnpj_enrich?: boolean
          run_dispatch?: boolean
          run_instagram?: boolean
          run_linkedin?: boolean
          run_maps?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_email_enabled?: boolean
          auto_instagram_enabled?: boolean
          auto_linkedin_dm_enabled?: boolean
          auto_socio_linkedin?: boolean
          auto_socio_linkedin_start_cadence?: boolean
          auto_telegram_enabled?: boolean
          auto_whatsapp_enabled?: boolean
          created_at?: string
          enabled?: boolean
          frequency_hours?: number
          id?: string
          ig_hashtags?: string[]
          ig_target_accounts?: string[]
          last_run_at?: string | null
          last_run_summary?: Json | null
          linkedin_search_terms?: string[]
          maps_niches?: string[]
          maps_regions?: string[]
          max_leads_per_run?: number
          min_score_360?: number
          next_run_at?: string | null
          require_partner_identified?: boolean
          require_partner_mobile?: boolean
          require_whatsapp_validated?: boolean
          run_cnpj_enrich?: boolean
          run_dispatch?: boolean
          run_instagram?: boolean
          run_linkedin?: boolean
          run_maps?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          cargo: string | null
          created_at: string
          dispatch_queue_ids: string[]
          id: string
          last_error: string | null
          nome_contato: string | null
          nome_empresa: string | null
          source: string
          source_id: string | null
          status: string
          step_atual: number
          telefone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          cargo?: string | null
          created_at?: string
          dispatch_queue_ids?: string[]
          id?: string
          last_error?: string | null
          nome_contato?: string | null
          nome_empresa?: string | null
          source: string
          source_id?: string | null
          status?: string
          step_atual?: number
          telefone: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          campaign_id?: string
          cargo?: string | null
          created_at?: string
          dispatch_queue_ids?: string[]
          id?: string
          last_error?: string | null
          nome_contato?: string | null
          nome_empresa?: string | null
          source?: string
          source_id?: string | null
          status?: string
          step_atual?: number
          telefone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          chips_ids: string[]
          completed_at: string | null
          created_at: string
          descricao: string | null
          failed_count: number
          id: string
          ignore_business_hours: boolean
          nome: string
          qualified_count: number
          replied_count: number
          scheduled_at: string | null
          sent_count: number
          sequence: Json
          source_filters: Json
          started_at: string | null
          status: string
          total_recipients: number
          updated_at: string
          user_id: string
        }
        Insert: {
          chips_ids?: string[]
          completed_at?: string | null
          created_at?: string
          descricao?: string | null
          failed_count?: number
          id?: string
          ignore_business_hours?: boolean
          nome: string
          qualified_count?: number
          replied_count?: number
          scheduled_at?: string | null
          sent_count?: number
          sequence?: Json
          source_filters?: Json
          started_at?: string | null
          status?: string
          total_recipients?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          chips_ids?: string[]
          completed_at?: string | null
          created_at?: string
          descricao?: string | null
          failed_count?: number
          id?: string
          ignore_business_hours?: boolean
          nome?: string
          qualified_count?: number
          replied_count?: number
          scheduled_at?: string | null
          sent_count?: number
          sequence?: Json
          source_filters?: Json
          started_at?: string | null
          status?: string
          total_recipients?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_subscriptions: {
        Row: {
          billing_cycle: string
          chips_limit: number | null
          coex_chatwoot_enabled: boolean
          contact_phone: string | null
          created_at: string
          dispatches_daily_limit: number | null
          email_dispatch_enabled: boolean
          id: string
          instagram_enabled: boolean
          kiwify_order_id: string | null
          kiwify_subscription_id: string | null
          linkedin_enabled: boolean
          notes: string | null
          plan: string
          rebuilds_limit: number | null
          rebuilds_used: number
          reseller_enabled: boolean
          reseller_id: string | null
          setup_fee_paid: number | null
          status: string
          updated_at: string
          use_admin_credentials: boolean
          user_id: string
        }
        Insert: {
          billing_cycle?: string
          chips_limit?: number | null
          coex_chatwoot_enabled?: boolean
          contact_phone?: string | null
          created_at?: string
          dispatches_daily_limit?: number | null
          email_dispatch_enabled?: boolean
          id?: string
          instagram_enabled?: boolean
          kiwify_order_id?: string | null
          kiwify_subscription_id?: string | null
          linkedin_enabled?: boolean
          notes?: string | null
          plan?: string
          rebuilds_limit?: number | null
          rebuilds_used?: number
          reseller_enabled?: boolean
          reseller_id?: string | null
          setup_fee_paid?: number | null
          status?: string
          updated_at?: string
          use_admin_credentials?: boolean
          user_id: string
        }
        Update: {
          billing_cycle?: string
          chips_limit?: number | null
          coex_chatwoot_enabled?: boolean
          contact_phone?: string | null
          created_at?: string
          dispatches_daily_limit?: number | null
          email_dispatch_enabled?: boolean
          id?: string
          instagram_enabled?: boolean
          kiwify_order_id?: string | null
          kiwify_subscription_id?: string | null
          linkedin_enabled?: boolean
          notes?: string | null
          plan?: string
          rebuilds_limit?: number | null
          rebuilds_used?: number
          reseller_enabled?: boolean
          reseller_id?: string | null
          setup_fee_paid?: number | null
          status?: string
          updated_at?: string
          use_admin_credentials?: boolean
          user_id?: string
        }
        Relationships: []
      }
      company_branding: {
        Row: {
          agent_name: string
          agent_tagline: string
          company_name: string
          created_at: string
          id: string
          logo_url: string | null
          primary_color: string | null
          updated_at: string
          user_id: string
          whatsapp_cta_label: string | null
          whatsapp_number: string | null
        }
        Insert: {
          agent_name?: string
          agent_tagline?: string
          company_name?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          updated_at?: string
          user_id: string
          whatsapp_cta_label?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          agent_name?: string
          agent_tagline?: string
          company_name?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_cta_label?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      dados4u_consultas: {
        Row: {
          celulares: Json | null
          cnpj: string | null
          cpf: string | null
          created_at: string
          emails: Json | null
          enderecos: Json | null
          falecido: string | null
          fixos: Json | null
          id: string
          lead_id: string | null
          nascimento: string | null
          nome: string | null
          nome_mae: string | null
          ocupacao: string | null
          raw_response: Json | null
          renda: string | null
          risco: string | null
          sexo: string | null
          situacao: string | null
          sociedades: Json | null
          tipo_consulta: string
          tokens_gastos: number | null
          updated_at: string
          user_id: string
          valor_consultado: string
        }
        Insert: {
          celulares?: Json | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          emails?: Json | null
          enderecos?: Json | null
          falecido?: string | null
          fixos?: Json | null
          id?: string
          lead_id?: string | null
          nascimento?: string | null
          nome?: string | null
          nome_mae?: string | null
          ocupacao?: string | null
          raw_response?: Json | null
          renda?: string | null
          risco?: string | null
          sexo?: string | null
          situacao?: string | null
          sociedades?: Json | null
          tipo_consulta: string
          tokens_gastos?: number | null
          updated_at?: string
          user_id?: string
          valor_consultado: string
        }
        Update: {
          celulares?: Json | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          emails?: Json | null
          enderecos?: Json | null
          falecido?: string | null
          fixos?: Json | null
          id?: string
          lead_id?: string | null
          nascimento?: string | null
          nome?: string | null
          nome_mae?: string | null
          ocupacao?: string | null
          raw_response?: Json | null
          renda?: string | null
          risco?: string | null
          sexo?: string | null
          situacao?: string | null
          sociedades?: Json | null
          tipo_consulta?: string
          tokens_gastos?: number | null
          updated_at?: string
          user_id?: string
          valor_consultado?: string
        }
        Relationships: []
      }
      deleted_leads_log: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          id: string
          nome_empresa: string | null
          payload: Json
          record_id: string | null
          source_table: string
          telefone: string | null
          user_id: string | null
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          nome_empresa?: string | null
          payload: Json
          record_id?: string | null
          source_table: string
          telefone?: string | null
          user_id?: string | null
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          nome_empresa?: string | null
          payload?: Json
          record_id?: string | null
          source_table?: string
          telefone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      disparos_humanizados: {
        Row: {
          audio_url: string | null
          created_at: string
          erro: string | null
          execution_id: string | null
          id: string
          lead_id: string | null
          mensagem: string | null
          nome_empresa: string | null
          raw: Json | null
          source: string
          status: string
          telefone: string | null
          tipo_envio: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          erro?: string | null
          execution_id?: string | null
          id?: string
          lead_id?: string | null
          mensagem?: string | null
          nome_empresa?: string | null
          raw?: Json | null
          source: string
          status?: string
          telefone?: string | null
          tipo_envio?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          erro?: string | null
          execution_id?: string | null
          id?: string
          lead_id?: string | null
          mensagem?: string | null
          nome_empresa?: string | null
          raw?: Json | null
          source?: string
          status?: string
          telefone?: string | null
          tipo_envio?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dispatch_queue: {
        Row: {
          accepted_at: string | null
          attempts: number
          audio_url: string | null
          campaign_id: string | null
          cargo: string | null
          channel: string
          chat_id: string | null
          chip_selection_reason: string | null
          cidade: string | null
          created_at: string
          delivered_at: string | null
          email: string | null
          especialidades: string | null
          evolution_response: Json | null
          followups_sent: number
          html_body: string | null
          id: string
          instagram_url: string | null
          last_error: string | null
          last_followup_at: string | null
          last_followup_stage: string | null
          linkedin_url: string | null
          max_attempts: number
          media_type: string | null
          media_url: string | null
          mensagem: string | null
          nome_contato: string | null
          nome_empresa: string | null
          provider_error: string | null
          provider_message_id: string | null
          provider_status: string | null
          proxy_url: string | null
          read_at: string | null
          recipient_handle: string | null
          scheduled_at: string
          scraped_context: string | null
          segmento: string | null
          send_as_audio: boolean
          sent_at: string | null
          sequence_step: number | null
          site: string | null
          source: string
          source_id: string | null
          status: string
          subject: string | null
          telefone: string | null
          unipile_account_id: string | null
          unipile_chat_id: string | null
          updated_at: string
          user_id: string
          username: string | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          attempts?: number
          audio_url?: string | null
          campaign_id?: string | null
          cargo?: string | null
          channel?: string
          chat_id?: string | null
          chip_selection_reason?: string | null
          cidade?: string | null
          created_at?: string
          delivered_at?: string | null
          email?: string | null
          especialidades?: string | null
          evolution_response?: Json | null
          followups_sent?: number
          html_body?: string | null
          id?: string
          instagram_url?: string | null
          last_error?: string | null
          last_followup_at?: string | null
          last_followup_stage?: string | null
          linkedin_url?: string | null
          max_attempts?: number
          media_type?: string | null
          media_url?: string | null
          mensagem?: string | null
          nome_contato?: string | null
          nome_empresa?: string | null
          provider_error?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          proxy_url?: string | null
          read_at?: string | null
          recipient_handle?: string | null
          scheduled_at?: string
          scraped_context?: string | null
          segmento?: string | null
          send_as_audio?: boolean
          sent_at?: string | null
          sequence_step?: number | null
          site?: string | null
          source: string
          source_id?: string | null
          status?: string
          subject?: string | null
          telefone?: string | null
          unipile_account_id?: string | null
          unipile_chat_id?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          attempts?: number
          audio_url?: string | null
          campaign_id?: string | null
          cargo?: string | null
          channel?: string
          chat_id?: string | null
          chip_selection_reason?: string | null
          cidade?: string | null
          created_at?: string
          delivered_at?: string | null
          email?: string | null
          especialidades?: string | null
          evolution_response?: Json | null
          followups_sent?: number
          html_body?: string | null
          id?: string
          instagram_url?: string | null
          last_error?: string | null
          last_followup_at?: string | null
          last_followup_stage?: string | null
          linkedin_url?: string | null
          max_attempts?: number
          media_type?: string | null
          media_url?: string | null
          mensagem?: string | null
          nome_contato?: string | null
          nome_empresa?: string | null
          provider_error?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          proxy_url?: string | null
          read_at?: string | null
          recipient_handle?: string | null
          scheduled_at?: string
          scraped_context?: string | null
          segmento?: string | null
          send_as_audio?: boolean
          sent_at?: string | null
          sequence_step?: number | null
          site?: string | null
          source?: string
          source_id?: string | null
          status?: string
          subject?: string | null
          telefone?: string | null
          unipile_account_id?: string | null
          unipile_chat_id?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_settings: {
        Row: {
          audio_ratio: number
          business_hour_end: number
          business_hour_start: number
          concat_messages: boolean
          created_at: string
          crm_move_on: string
          daily_limit: number
          email_daily_limit: number
          email_from_name: string | null
          email_min_delay_seconds: number
          email_paused: boolean
          email_reply_to: string | null
          followup_delay_hours: number
          followup_enabled: boolean
          followup_max_attempts: number
          followup_template: string | null
          id: string
          instagram_daily_limit: number
          instagram_paused: boolean
          linkedin_daily_limit: number
          linkedin_paused: boolean
          max_delay_seconds: number
          messenger_daily_limit: number
          messenger_paused: boolean
          min_delay_seconds: number
          monthly_target: number | null
          paused: boolean
          proxy_url: string | null
          respect_business_hours: boolean
          telegram_daily_limit: number
          telegram_paused: boolean
          updated_at: string
          use_audio: boolean
          user_id: string
          warmup_mode: boolean
          whatsapp_paused: boolean
        }
        Insert: {
          audio_ratio?: number
          business_hour_end?: number
          business_hour_start?: number
          concat_messages?: boolean
          created_at?: string
          crm_move_on?: string
          daily_limit?: number
          email_daily_limit?: number
          email_from_name?: string | null
          email_min_delay_seconds?: number
          email_paused?: boolean
          email_reply_to?: string | null
          followup_delay_hours?: number
          followup_enabled?: boolean
          followup_max_attempts?: number
          followup_template?: string | null
          id?: string
          instagram_daily_limit?: number
          instagram_paused?: boolean
          linkedin_daily_limit?: number
          linkedin_paused?: boolean
          max_delay_seconds?: number
          messenger_daily_limit?: number
          messenger_paused?: boolean
          min_delay_seconds?: number
          monthly_target?: number | null
          paused?: boolean
          proxy_url?: string | null
          respect_business_hours?: boolean
          telegram_daily_limit?: number
          telegram_paused?: boolean
          updated_at?: string
          use_audio?: boolean
          user_id: string
          warmup_mode?: boolean
          whatsapp_paused?: boolean
        }
        Update: {
          audio_ratio?: number
          business_hour_end?: number
          business_hour_start?: number
          concat_messages?: boolean
          created_at?: string
          crm_move_on?: string
          daily_limit?: number
          email_daily_limit?: number
          email_from_name?: string | null
          email_min_delay_seconds?: number
          email_paused?: boolean
          email_reply_to?: string | null
          followup_delay_hours?: number
          followup_enabled?: boolean
          followup_max_attempts?: number
          followup_template?: string | null
          id?: string
          instagram_daily_limit?: number
          instagram_paused?: boolean
          linkedin_daily_limit?: number
          linkedin_paused?: boolean
          max_delay_seconds?: number
          messenger_daily_limit?: number
          messenger_paused?: boolean
          min_delay_seconds?: number
          monthly_target?: number | null
          paused?: boolean
          proxy_url?: string | null
          respect_business_hours?: boolean
          telegram_daily_limit?: number
          telegram_paused?: boolean
          updated_at?: string
          use_audio?: boolean
          user_id?: string
          warmup_mode?: boolean
          whatsapp_paused?: boolean
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
      empresas_enriquecidas: {
        Row: {
          atividade_principal: string | null
          cnpj: string
          cnpj_validado: boolean
          created_at: string
          dados4u_searched_at: string | null
          data_disparo: string | null
          email: string | null
          email_disparo: string
          endereco: string | null
          fonte: string
          id: string
          instagram_searched_at: string | null
          lead_id: string | null
          natureza_juridica: string | null
          nome_empresa: string
          nome_fantasia: string | null
          porte: string | null
          rating: number | null
          razao_social: string | null
          reviews: number | null
          site: string | null
          situacao: string | null
          socio_linkedin_searched_at: string | null
          socios: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          atividade_principal?: string | null
          cnpj: string
          cnpj_validado?: boolean
          created_at?: string
          dados4u_searched_at?: string | null
          data_disparo?: string | null
          email?: string | null
          email_disparo?: string
          endereco?: string | null
          fonte?: string
          id?: string
          instagram_searched_at?: string | null
          lead_id?: string | null
          natureza_juridica?: string | null
          nome_empresa: string
          nome_fantasia?: string | null
          porte?: string | null
          rating?: number | null
          razao_social?: string | null
          reviews?: number | null
          site?: string | null
          situacao?: string | null
          socio_linkedin_searched_at?: string | null
          socios?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          atividade_principal?: string | null
          cnpj?: string
          cnpj_validado?: boolean
          created_at?: string
          dados4u_searched_at?: string | null
          data_disparo?: string | null
          email?: string | null
          email_disparo?: string
          endereco?: string | null
          fonte?: string
          id?: string
          instagram_searched_at?: string | null
          lead_id?: string | null
          natureza_juridica?: string | null
          nome_empresa?: string
          nome_fantasia?: string | null
          porte?: string | null
          rating?: number | null
          razao_social?: string | null
          reviews?: number | null
          site?: string | null
          situacao?: string | null
          socio_linkedin_searched_at?: string | null
          socios?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_enriquecidas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_licenses: {
        Row: {
          activated_at: string | null
          active: boolean
          created_at: string
          device_id: string | null
          device_info: Json | null
          id: string
          last_used_at: string | null
          license_key: string
          notes: string | null
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          active?: boolean
          created_at?: string
          device_id?: string | null
          device_info?: Json | null
          id?: string
          last_used_at?: string | null
          license_key: string
          notes?: string | null
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          activated_at?: string | null
          active?: boolean
          created_at?: string
          device_id?: string | null
          device_info?: Json | null
          id?: string
          last_used_at?: string | null
          license_key?: string
          notes?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          calendar_id: string
          created_at: string
          email: string | null
          expires_at: string
          id: string
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          calendar_id?: string
          created_at?: string
          email?: string | null
          expires_at: string
          id?: string
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          calendar_id?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instagram_contacts: {
        Row: {
          bio: string | null
          created_at: string
          data_disparo: string | null
          disparo: string | null
          dm_data_disparo: string | null
          dm_disparo: string
          email: string | null
          email_disparo: string
          extraction_source: string | null
          extraction_target: string | null
          id: string
          is_business: boolean | null
          is_verified: boolean | null
          mensagem: string | null
          nome: string | null
          posts: number | null
          profile_pic_url: string | null
          profile_url: string | null
          provider_id: string | null
          seguidores: number | null
          seguindo: number | null
          site: string | null
          updated_at: string
          user_id: string
          username: string
          whatsapp: string | null
          whatsapp_validado: boolean | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          data_disparo?: string | null
          disparo?: string | null
          dm_data_disparo?: string | null
          dm_disparo?: string
          email?: string | null
          email_disparo?: string
          extraction_source?: string | null
          extraction_target?: string | null
          id?: string
          is_business?: boolean | null
          is_verified?: boolean | null
          mensagem?: string | null
          nome?: string | null
          posts?: number | null
          profile_pic_url?: string | null
          profile_url?: string | null
          provider_id?: string | null
          seguidores?: number | null
          seguindo?: number | null
          site?: string | null
          updated_at?: string
          user_id?: string
          username: string
          whatsapp?: string | null
          whatsapp_validado?: boolean | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          data_disparo?: string | null
          disparo?: string | null
          dm_data_disparo?: string | null
          dm_disparo?: string
          email?: string | null
          email_disparo?: string
          extraction_source?: string | null
          extraction_target?: string | null
          id?: string
          is_business?: boolean | null
          is_verified?: boolean | null
          mensagem?: string | null
          nome?: string | null
          posts?: number | null
          profile_pic_url?: string | null
          profile_url?: string | null
          provider_id?: string | null
          seguidores?: number | null
          seguindo?: number | null
          site?: string | null
          updated_at?: string
          user_id?: string
          username?: string
          whatsapp?: string | null
          whatsapp_validado?: boolean | null
        }
        Relationships: []
      }
      instagram_hashtag_leads: {
        Row: {
          bio: string | null
          created_at: string
          data_disparo: string | null
          disparo: string | null
          followers: number | null
          full_name: string | null
          hashtag: string
          id: string
          mensagem: string | null
          post_caption: string | null
          post_url: string | null
          scraped_at: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          data_disparo?: string | null
          disparo?: string | null
          followers?: number | null
          full_name?: string | null
          hashtag: string
          id?: string
          mensagem?: string | null
          post_caption?: string | null
          post_url?: string | null
          scraped_at?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          data_disparo?: string | null
          disparo?: string | null
          followers?: number | null
          full_name?: string | null
          hashtag?: string
          id?: string
          mensagem?: string | null
          post_caption?: string | null
          post_url?: string | null
          scraped_at?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      job_board_companies: {
        Row: {
          created_at: string
          data_disparo: string | null
          descricao: string | null
          disparo: string | null
          email: string | null
          fonte: string
          id: string
          localizacao: string | null
          mensagem: string | null
          nome_empresa: string
          porte: string | null
          segmento: string | null
          site: string | null
          telefone: string | null
          updated_at: string
          url_perfil: string | null
          user_id: string
          vagas_abertas: number | null
        }
        Insert: {
          created_at?: string
          data_disparo?: string | null
          descricao?: string | null
          disparo?: string | null
          email?: string | null
          fonte: string
          id?: string
          localizacao?: string | null
          mensagem?: string | null
          nome_empresa: string
          porte?: string | null
          segmento?: string | null
          site?: string | null
          telefone?: string | null
          updated_at?: string
          url_perfil?: string | null
          user_id?: string
          vagas_abertas?: number | null
        }
        Update: {
          created_at?: string
          data_disparo?: string | null
          descricao?: string | null
          disparo?: string | null
          email?: string | null
          fonte?: string
          id?: string
          localizacao?: string | null
          mensagem?: string | null
          nome_empresa?: string
          porte?: string | null
          segmento?: string | null
          site?: string | null
          telefone?: string | null
          updated_at?: string
          url_perfil?: string | null
          user_id?: string
          vagas_abertas?: number | null
        }
        Relationships: []
      }
      job_listings: {
        Row: {
          created_at: string
          data_disparo: string | null
          descricao: string | null
          disparo: string | null
          email: string | null
          empresa: string | null
          fonte: string
          id: string
          localizacao: string | null
          mensagem: string | null
          requisitos: string | null
          salario: string | null
          setor: string | null
          site_empresa: string | null
          telefone: string | null
          titulo_vaga: string
          updated_at: string
          url_vaga: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data_disparo?: string | null
          descricao?: string | null
          disparo?: string | null
          email?: string | null
          empresa?: string | null
          fonte: string
          id?: string
          localizacao?: string | null
          mensagem?: string | null
          requisitos?: string | null
          salario?: string | null
          setor?: string | null
          site_empresa?: string | null
          telefone?: string | null
          titulo_vaga: string
          updated_at?: string
          url_vaga?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          data_disparo?: string | null
          descricao?: string | null
          disparo?: string | null
          email?: string | null
          empresa?: string | null
          fonte?: string
          id?: string
          localizacao?: string | null
          mensagem?: string | null
          requisitos?: string | null
          salario?: string | null
          setor?: string | null
          site_empresa?: string | null
          telefone?: string | null
          titulo_vaga?: string
          updated_at?: string
          url_vaga?: string | null
          user_id?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          user_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          user_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          char_count: number | null
          chunk_count: number | null
          created_at: string
          error: string | null
          id: string
          source_type: string
          status: string
          storage_path: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          char_count?: number | null
          chunk_count?: number | null
          created_at?: string
          error?: string | null
          id?: string
          source_type?: string
          status?: string
          storage_path?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          char_count?: number | null
          chunk_count?: number | null
          created_at?: string
          error?: string | null
          id?: string
          source_type?: string
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_folder_items: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          source: string
          source_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          source: string
          source_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          id?: string
          source?: string
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "lead_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_folders: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_pipeline_status: {
        Row: {
          created_at: string
          id: string
          last_dispatched_at: string | null
          last_dispatched_channel: string | null
          notes: string | null
          pipeline_card_id: string | null
          source: string
          source_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_dispatched_at?: string | null
          last_dispatched_channel?: string | null
          notes?: string | null
          pipeline_card_id?: string | null
          source: string
          source_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_dispatched_at?: string | null
          last_dispatched_channel?: string | null
          notes?: string | null
          pipeline_card_id?: string | null
          source?: string
          source_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_pipeline_status_pipeline_card_id_fkey"
            columns: ["pipeline_card_id"]
            isOneToOne: false
            referencedRelation: "pipeline_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tag_assignments: {
        Row: {
          created_at: string
          id: string
          source: string
          source_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source: string
          source_id: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source?: string
          source_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "lead_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          cargo: string | null
          cidade: string | null
          cnpj: string | null
          cnpj_validado: boolean | null
          created_at: string
          data_disparo: string | null
          disparo: string | null
          email: string | null
          email_disparo: string
          endereco: string | null
          especialidades: string | null
          id: string
          mensagem: string | null
          natureza_juridica: string | null
          nome_contato: string | null
          nome_empresa: string
          porte: string | null
          rating: number | null
          razao_social: string | null
          reviews: number | null
          segmento: string | null
          site: string | null
          socios: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cargo?: string | null
          cidade?: string | null
          cnpj?: string | null
          cnpj_validado?: boolean | null
          created_at?: string
          data_disparo?: string | null
          disparo?: string | null
          email?: string | null
          email_disparo?: string
          endereco?: string | null
          especialidades?: string | null
          id?: string
          mensagem?: string | null
          natureza_juridica?: string | null
          nome_contato?: string | null
          nome_empresa: string
          porte?: string | null
          rating?: number | null
          razao_social?: string | null
          reviews?: number | null
          segmento?: string | null
          site?: string | null
          socios?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          cargo?: string | null
          cidade?: string | null
          cnpj?: string | null
          cnpj_validado?: boolean | null
          created_at?: string
          data_disparo?: string | null
          disparo?: string | null
          email?: string | null
          email_disparo?: string
          endereco?: string | null
          especialidades?: string | null
          id?: string
          mensagem?: string | null
          natureza_juridica?: string | null
          nome_contato?: string | null
          nome_empresa?: string
          porte?: string | null
          rating?: number | null
          razao_social?: string | null
          reviews?: number | null
          segmento?: string | null
          site?: string | null
          socios?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      linkedin_contacts: {
        Row: {
          cadencia_falhas: number
          cadencia_status: string
          cargo: string | null
          conexao_aceita_em: string | null
          conexoes: number | null
          created_at: string
          data_disparo: string | null
          data_prox_disparo: string | null
          disparo: string | null
          email: string | null
          email_disparo: string
          empresa: string | null
          etapa_atual: string
          id: string
          last_attempt_at: string | null
          linkedin_url: string | null
          localizacao: string | null
          mensagem: string | null
          nome: string
          provider_id: string | null
          sobre: string | null
          telefone: string | null
          ultima_falha: string | null
          ultima_resposta_em: string | null
          ultima_resposta_texto: string | null
          unipile_account_id: string | null
          unipile_chat_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cadencia_falhas?: number
          cadencia_status?: string
          cargo?: string | null
          conexao_aceita_em?: string | null
          conexoes?: number | null
          created_at?: string
          data_disparo?: string | null
          data_prox_disparo?: string | null
          disparo?: string | null
          email?: string | null
          email_disparo?: string
          empresa?: string | null
          etapa_atual?: string
          id?: string
          last_attempt_at?: string | null
          linkedin_url?: string | null
          localizacao?: string | null
          mensagem?: string | null
          nome: string
          provider_id?: string | null
          sobre?: string | null
          telefone?: string | null
          ultima_falha?: string | null
          ultima_resposta_em?: string | null
          ultima_resposta_texto?: string | null
          unipile_account_id?: string | null
          unipile_chat_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          cadencia_falhas?: number
          cadencia_status?: string
          cargo?: string | null
          conexao_aceita_em?: string | null
          conexoes?: number | null
          created_at?: string
          data_disparo?: string | null
          data_prox_disparo?: string | null
          disparo?: string | null
          email?: string | null
          email_disparo?: string
          empresa?: string | null
          etapa_atual?: string
          id?: string
          last_attempt_at?: string | null
          linkedin_url?: string | null
          localizacao?: string | null
          mensagem?: string | null
          nome?: string
          provider_id?: string | null
          sobre?: string | null
          telefone?: string | null
          ultima_falha?: string | null
          ultima_resposta_em?: string | null
          ultima_resposta_texto?: string | null
          unipile_account_id?: string | null
          unipile_chat_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mavi_briefing: {
        Row: {
          abordagem_preferida: string | null
          clientes_referencia: string[]
          created_at: string
          gatilhos_compra: string[]
          icp_descricao: string | null
          id: string
          last_learned_at: string | null
          learned_patterns: Json
          objecoes_comuns: string[]
          personas_alvo: string[]
          portes_alvo: string[]
          segmentos_alvo: string[]
          spin_bank: Json
          updated_at: string
          user_id: string
          value_props: string[]
        }
        Insert: {
          abordagem_preferida?: string | null
          clientes_referencia?: string[]
          created_at?: string
          gatilhos_compra?: string[]
          icp_descricao?: string | null
          id?: string
          last_learned_at?: string | null
          learned_patterns?: Json
          objecoes_comuns?: string[]
          personas_alvo?: string[]
          portes_alvo?: string[]
          segmentos_alvo?: string[]
          spin_bank?: Json
          updated_at?: string
          user_id: string
          value_props?: string[]
        }
        Update: {
          abordagem_preferida?: string | null
          clientes_referencia?: string[]
          created_at?: string
          gatilhos_compra?: string[]
          icp_descricao?: string | null
          id?: string
          last_learned_at?: string | null
          learned_patterns?: Json
          objecoes_comuns?: string[]
          personas_alvo?: string[]
          portes_alvo?: string[]
          segmentos_alvo?: string[]
          spin_bank?: Json
          updated_at?: string
          user_id?: string
          value_props?: string[]
        }
        Relationships: []
      }
      mavi_conversation_outcomes: {
        Row: {
          analysis: Json
          conversation_id: string
          created_at: string
          id: string
          objection_type: string | null
          opening_used: string | null
          outcome: string
          porte: string | null
          segment: string | null
          spin_phase_reached: string | null
          user_id: string
        }
        Insert: {
          analysis?: Json
          conversation_id: string
          created_at?: string
          id?: string
          objection_type?: string | null
          opening_used?: string | null
          outcome: string
          porte?: string | null
          segment?: string | null
          spin_phase_reached?: string | null
          user_id: string
        }
        Update: {
          analysis?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          objection_type?: string | null
          opening_used?: string | null
          outcome?: string
          porte?: string | null
          segment?: string | null
          spin_phase_reached?: string | null
          user_id?: string
        }
        Relationships: []
      }
      meta_instagram_accounts: {
        Row: {
          access_token: string
          connected_at: string
          created_at: string
          expires_at: string | null
          id: string
          ig_user_id: string
          metadata: Json | null
          refreshed_at: string | null
          scopes: string | null
          token_type: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          access_token: string
          connected_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ig_user_id: string
          metadata?: Json | null
          refreshed_at?: string | null
          scopes?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          access_token?: string
          connected_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          ig_user_id?: string
          metadata?: Json | null
          refreshed_at?: string | null
          scopes?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      meta_webhook_events: {
        Row: {
          created_at: string
          event_type: string | null
          id: string
          ig_user_id: string | null
          interaction_id: string | null
          object: string | null
          payload: Json
          processed: boolean
          processed_at: string | null
          processing_error: string | null
          received_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          id?: string
          ig_user_id?: string | null
          interaction_id?: string | null
          object?: string | null
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string | null
          id?: string
          ig_user_id?: string | null
          interaction_id?: string | null
          object?: string | null
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pipeline_cards: {
        Row: {
          contato: string | null
          created_at: string
          email: string | null
          estagio: Database["public"]["Enums"]["pipeline_stage"]
          id: string
          nome_empresa: string | null
          observacoes: string | null
          origem: string | null
          position: number
          proximo_followup_at: string | null
          source_id: string | null
          source_table: string | null
          telefone: string | null
          updated_at: string
          user_id: string
          valor_estimado: number | null
        }
        Insert: {
          contato?: string | null
          created_at?: string
          email?: string | null
          estagio?: Database["public"]["Enums"]["pipeline_stage"]
          id?: string
          nome_empresa?: string | null
          observacoes?: string | null
          origem?: string | null
          position?: number
          proximo_followup_at?: string | null
          source_id?: string | null
          source_table?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
          valor_estimado?: number | null
        }
        Update: {
          contato?: string | null
          created_at?: string
          email?: string | null
          estagio?: Database["public"]["Enums"]["pipeline_stage"]
          id?: string
          nome_empresa?: string | null
          observacoes?: string | null
          origem?: string | null
          position?: number
          proximo_followup_at?: string | null
          source_id?: string | null
          source_table?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
          valor_estimado?: number | null
        }
        Relationships: []
      }
      pipeline_history: {
        Row: {
          card_id: string
          created_at: string
          from_stage: Database["public"]["Enums"]["pipeline_stage"] | null
          id: string
          note: string | null
          to_stage: Database["public"]["Enums"]["pipeline_stage"]
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["pipeline_stage"] | null
          id?: string
          note?: string | null
          to_stage: Database["public"]["Enums"]["pipeline_stage"]
          user_id?: string
        }
        Update: {
          card_id?: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["pipeline_stage"] | null
          id?: string
          note?: string | null
          to_stage?: Database["public"]["Enums"]["pipeline_stage"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "pipeline_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarding_step: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_step?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_step?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prospecting_profiles: {
        Row: {
          agent_system_prompt: string | null
          business_context: string | null
          created_at: string
          diferenciais: string | null
          gmb_url: string | null
          id: string
          instagram_url: string | null
          ja_tentou: string | null
          linkedin_url: string | null
          mental_triggers: Json | null
          plan: Json | null
          produto: string | null
          publico_alvo: string | null
          regiao: string | null
          scraped_data: Json | null
          site_url: string | null
          system_prompt: string | null
          ticket_medio: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_system_prompt?: string | null
          business_context?: string | null
          created_at?: string
          diferenciais?: string | null
          gmb_url?: string | null
          id?: string
          instagram_url?: string | null
          ja_tentou?: string | null
          linkedin_url?: string | null
          mental_triggers?: Json | null
          plan?: Json | null
          produto?: string | null
          publico_alvo?: string | null
          regiao?: string | null
          scraped_data?: Json | null
          site_url?: string | null
          system_prompt?: string | null
          ticket_medio?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          agent_system_prompt?: string | null
          business_context?: string | null
          created_at?: string
          diferenciais?: string | null
          gmb_url?: string | null
          id?: string
          instagram_url?: string | null
          ja_tentou?: string | null
          linkedin_url?: string | null
          mental_triggers?: Json | null
          plan?: Json | null
          produto?: string | null
          publico_alvo?: string | null
          regiao?: string | null
          scraped_data?: Json | null
          site_url?: string | null
          system_prompt?: string | null
          ticket_medio?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qualification_conversations: {
        Row: {
          cargo: string | null
          channel: string
          context_pack: string | null
          created_at: string
          fase_spin: string | null
          flow_step: number | null
          followups_sent: number
          id: string
          last_followup_at: string | null
          last_followup_stage: string | null
          last_inbound_at: string | null
          last_message_at: string
          last_reengagement_at: string | null
          locked_at: string | null
          nome: string | null
          nome_contato: string | null
          qualified: boolean
          qualified_at: string | null
          reengagements_sent: number
          status: string
          summary: string | null
          telefone: string | null
          unipile_account_id: string | null
          unipile_chat_id: string | null
          unipile_provider_id: string | null
          unipile_reply_to: string | null
          unipile_subject: string | null
          updated_at: string
          user_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          cargo?: string | null
          channel?: string
          context_pack?: string | null
          created_at?: string
          fase_spin?: string | null
          flow_step?: number | null
          followups_sent?: number
          id?: string
          last_followup_at?: string | null
          last_followup_stage?: string | null
          last_inbound_at?: string | null
          last_message_at?: string
          last_reengagement_at?: string | null
          locked_at?: string | null
          nome?: string | null
          nome_contato?: string | null
          qualified?: boolean
          qualified_at?: string | null
          reengagements_sent?: number
          status?: string
          summary?: string | null
          telefone?: string | null
          unipile_account_id?: string | null
          unipile_chat_id?: string | null
          unipile_provider_id?: string | null
          unipile_reply_to?: string | null
          unipile_subject?: string | null
          updated_at?: string
          user_id: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          cargo?: string | null
          channel?: string
          context_pack?: string | null
          created_at?: string
          fase_spin?: string | null
          flow_step?: number | null
          followups_sent?: number
          id?: string
          last_followup_at?: string | null
          last_followup_stage?: string | null
          last_inbound_at?: string | null
          last_message_at?: string
          last_reengagement_at?: string | null
          locked_at?: string | null
          nome?: string | null
          nome_contato?: string | null
          qualified?: boolean
          qualified_at?: string | null
          reengagements_sent?: number
          status?: string
          summary?: string | null
          telefone?: string | null
          unipile_account_id?: string | null
          unipile_chat_id?: string | null
          unipile_provider_id?: string | null
          unipile_reply_to?: string | null
          unipile_subject?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: []
      }
      qualification_messages: {
        Row: {
          audio_url: string | null
          channel: string
          content: string | null
          conversation_id: string
          created_at: string
          error: string | null
          evolution_response: Json | null
          id: string
          message_id: string | null
          processed: boolean
          role: string
          telefone: string | null
          transcribed: boolean
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          channel?: string
          content?: string | null
          conversation_id: string
          created_at?: string
          error?: string | null
          evolution_response?: Json | null
          id?: string
          message_id?: string | null
          processed?: boolean
          role: string
          telefone?: string | null
          transcribed?: boolean
          user_id: string
        }
        Update: {
          audio_url?: string | null
          channel?: string
          content?: string | null
          conversation_id?: string
          created_at?: string
          error?: string | null
          evolution_response?: Json | null
          id?: string
          message_id?: string | null
          processed?: boolean
          role?: string
          telefone?: string | null
          transcribed?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualification_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "qualification_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      qualification_settings: {
        Row: {
          attendant_instance_id: string | null
          audio_ratio: number
          buffer_seconds: number
          created_at: string
          fixed_image_caption: string | null
          fixed_image_url: string | null
          fixed_link: string | null
          fixed_link_label: string | null
          fixed_video_caption: string | null
          fixed_video_url: string | null
          flow_mode: string | null
          handoff_group_jid: string | null
          handoff_group_name: string | null
          id: string
          opening_delay_seconds: number
          paused: boolean
          reengagement_delay_hours: number
          reengagement_enabled: boolean
          reengagement_max_attempts: number
          reengagement_template: string | null
          response_instructions: string | null
          schedule_block_friday: boolean
          schedule_block_monday: boolean
          schedule_block_saturday: boolean
          schedule_block_sunday: boolean
          schedule_block_thursday: boolean
          schedule_block_tuesday: boolean
          schedule_block_wednesday: boolean
          schedule_hour_end: number
          schedule_hour_start: number
          schedule_slot_minutes: number
          schedule_timezone: string
          system_prompt: string | null
          updated_at: string
          use_audio: boolean
          user_id: string
          voice_id: string | null
          webhook_path: string
        }
        Insert: {
          attendant_instance_id?: string | null
          audio_ratio?: number
          buffer_seconds?: number
          created_at?: string
          fixed_image_caption?: string | null
          fixed_image_url?: string | null
          fixed_link?: string | null
          fixed_link_label?: string | null
          fixed_video_caption?: string | null
          fixed_video_url?: string | null
          flow_mode?: string | null
          handoff_group_jid?: string | null
          handoff_group_name?: string | null
          id?: string
          opening_delay_seconds?: number
          paused?: boolean
          reengagement_delay_hours?: number
          reengagement_enabled?: boolean
          reengagement_max_attempts?: number
          reengagement_template?: string | null
          response_instructions?: string | null
          schedule_block_friday?: boolean
          schedule_block_monday?: boolean
          schedule_block_saturday?: boolean
          schedule_block_sunday?: boolean
          schedule_block_thursday?: boolean
          schedule_block_tuesday?: boolean
          schedule_block_wednesday?: boolean
          schedule_hour_end?: number
          schedule_hour_start?: number
          schedule_slot_minutes?: number
          schedule_timezone?: string
          system_prompt?: string | null
          updated_at?: string
          use_audio?: boolean
          user_id: string
          voice_id?: string | null
          webhook_path?: string
        }
        Update: {
          attendant_instance_id?: string | null
          audio_ratio?: number
          buffer_seconds?: number
          created_at?: string
          fixed_image_caption?: string | null
          fixed_image_url?: string | null
          fixed_link?: string | null
          fixed_link_label?: string | null
          fixed_video_caption?: string | null
          fixed_video_url?: string | null
          flow_mode?: string | null
          handoff_group_jid?: string | null
          handoff_group_name?: string | null
          id?: string
          opening_delay_seconds?: number
          paused?: boolean
          reengagement_delay_hours?: number
          reengagement_enabled?: boolean
          reengagement_max_attempts?: number
          reengagement_template?: string | null
          response_instructions?: string | null
          schedule_block_friday?: boolean
          schedule_block_monday?: boolean
          schedule_block_saturday?: boolean
          schedule_block_sunday?: boolean
          schedule_block_thursday?: boolean
          schedule_block_tuesday?: boolean
          schedule_block_wednesday?: boolean
          schedule_hour_end?: number
          schedule_hour_start?: number
          schedule_slot_minutes?: number
          schedule_timezone?: string
          system_prompt?: string | null
          updated_at?: string
          use_audio?: boolean
          user_id?: string
          voice_id?: string | null
          webhook_path?: string
        }
        Relationships: []
      }
      saved_webhooks: {
        Row: {
          created_at: string
          id: string
          nome: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          url: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_meetings: {
        Row: {
          conversation_id: string | null
          created_at: string
          descricao: string | null
          end_at: string
          google_event_id: string | null
          id: string
          lead_email: string | null
          lead_nome: string | null
          lead_telefone: string
          meet_link: string | null
          notified_group: boolean
          notified_lead: boolean
          start_at: string
          status: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          descricao?: string | null
          end_at: string
          google_event_id?: string | null
          id?: string
          lead_email?: string | null
          lead_nome?: string | null
          lead_telefone: string
          meet_link?: string | null
          notified_group?: boolean
          notified_lead?: boolean
          start_at: string
          status?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          descricao?: string | null
          end_at?: string
          google_event_id?: string | null
          id?: string
          lead_email?: string | null
          lead_nome?: string | null
          lead_telefone?: string
          meet_link?: string | null
          notified_group?: boolean
          notified_lead?: boolean
          start_at?: string
          status?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_auto_engage_rules: {
        Row: {
          active: boolean
          ai_tone: string | null
          capture_lead: boolean
          channel: string
          created_at: string
          cta_label: string | null
          cta_link: string | null
          default_link: string | null
          dm_template: string
          followup_delay_hours: number | null
          followup_message: string | null
          followup_use_ai: boolean
          hits_count: number
          id: string
          keyword: string | null
          last_hit_at: string | null
          mode: string
          move_to_dm_on_interest: boolean
          post_id: string | null
          priority: number
          public_reply_template: string | null
          reply_public: boolean
          require_follower: boolean
          send_dm: boolean
          updated_at: string
          use_ai: boolean
          user_id: string
        }
        Insert: {
          active?: boolean
          ai_tone?: string | null
          capture_lead?: boolean
          channel: string
          created_at?: string
          cta_label?: string | null
          cta_link?: string | null
          default_link?: string | null
          dm_template?: string
          followup_delay_hours?: number | null
          followup_message?: string | null
          followup_use_ai?: boolean
          hits_count?: number
          id?: string
          keyword?: string | null
          last_hit_at?: string | null
          mode?: string
          move_to_dm_on_interest?: boolean
          post_id?: string | null
          priority?: number
          public_reply_template?: string | null
          reply_public?: boolean
          require_follower?: boolean
          send_dm?: boolean
          updated_at?: string
          use_ai?: boolean
          user_id: string
        }
        Update: {
          active?: boolean
          ai_tone?: string | null
          capture_lead?: boolean
          channel?: string
          created_at?: string
          cta_label?: string | null
          cta_link?: string | null
          default_link?: string | null
          dm_template?: string
          followup_delay_hours?: number | null
          followup_message?: string | null
          followup_use_ai?: boolean
          hits_count?: number
          id?: string
          keyword?: string | null
          last_hit_at?: string | null
          mode?: string
          move_to_dm_on_interest?: boolean
          post_id?: string | null
          priority?: number
          public_reply_template?: string | null
          reply_public?: boolean
          require_follower?: boolean
          send_dm?: boolean
          updated_at?: string
          use_ai?: boolean
          user_id?: string
        }
        Relationships: []
      }
      social_brand_assets: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          kind: string
          label: string | null
          notes: string | null
          public_url: string | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          kind: string
          label?: string | null
          notes?: string | null
          public_url?: string | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          kind?: string
          label?: string | null
          notes?: string | null
          public_url?: string | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_brand_profile: {
        Row: {
          avatar_urls: Json | null
          avg_comments: number | null
          avg_likes: number | null
          bio: string | null
          bio_link_slug: string | null
          color_palette: Json | null
          created_at: string
          cta_style: string | null
          display_name: string | null
          engagement_rate: number | null
          followers_count: number | null
          following_count: number | null
          font_style: string | null
          id: string
          insights: Json | null
          insights_updated_at: string | null
          instagram_handle: string | null
          is_business: boolean | null
          last_analyzed_at: string | null
          layout_pattern: string | null
          links: Json | null
          logo_url: string | null
          niche: string | null
          photography_style: string | null
          posts_count: number | null
          raw_analysis: Json | null
          sample_post_urls: Json | null
          updated_at: string
          user_id: string
          verified: boolean | null
          visual_mood: string | null
          voice_tone: string | null
        }
        Insert: {
          avatar_urls?: Json | null
          avg_comments?: number | null
          avg_likes?: number | null
          bio?: string | null
          bio_link_slug?: string | null
          color_palette?: Json | null
          created_at?: string
          cta_style?: string | null
          display_name?: string | null
          engagement_rate?: number | null
          followers_count?: number | null
          following_count?: number | null
          font_style?: string | null
          id?: string
          insights?: Json | null
          insights_updated_at?: string | null
          instagram_handle?: string | null
          is_business?: boolean | null
          last_analyzed_at?: string | null
          layout_pattern?: string | null
          links?: Json | null
          logo_url?: string | null
          niche?: string | null
          photography_style?: string | null
          posts_count?: number | null
          raw_analysis?: Json | null
          sample_post_urls?: Json | null
          updated_at?: string
          user_id: string
          verified?: boolean | null
          visual_mood?: string | null
          voice_tone?: string | null
        }
        Update: {
          avatar_urls?: Json | null
          avg_comments?: number | null
          avg_likes?: number | null
          bio?: string | null
          bio_link_slug?: string | null
          color_palette?: Json | null
          created_at?: string
          cta_style?: string | null
          display_name?: string | null
          engagement_rate?: number | null
          followers_count?: number | null
          following_count?: number | null
          font_style?: string | null
          id?: string
          insights?: Json | null
          insights_updated_at?: string | null
          instagram_handle?: string | null
          is_business?: boolean | null
          last_analyzed_at?: string | null
          layout_pattern?: string | null
          links?: Json | null
          logo_url?: string | null
          niche?: string | null
          photography_style?: string | null
          posts_count?: number | null
          raw_analysis?: Json | null
          sample_post_urls?: Json | null
          updated_at?: string
          user_id?: string
          verified?: boolean | null
          visual_mood?: string | null
          voice_tone?: string | null
        }
        Relationships: []
      }
      social_content_plans: {
        Row: {
          created_at: string
          id: string
          last_error: string | null
          product_id: string | null
          status: string
          theme_summary: Json
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_error?: string | null
          product_id?: string | null
          status?: string
          theme_summary?: Json
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          last_error?: string | null
          product_id?: string | null
          status?: string
          theme_summary?: Json
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_content_plans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "social_products"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_interactions: {
        Row: {
          actor_handle: string | null
          actor_name: string | null
          actor_profile_url: string | null
          actor_provider_id: string | null
          channel: string
          content: string | null
          created_at: string
          dm_content: string | null
          dm_sent: boolean
          error: string | null
          id: string
          lead_created: boolean
          lead_id: string | null
          lead_table: string | null
          post_id: string | null
          qualified: boolean
          replied: boolean
          reply_content: string | null
          spin_stage: string | null
          type: string
          unipile_event_id: string | null
          user_id: string
        }
        Insert: {
          actor_handle?: string | null
          actor_name?: string | null
          actor_profile_url?: string | null
          actor_provider_id?: string | null
          channel: string
          content?: string | null
          created_at?: string
          dm_content?: string | null
          dm_sent?: boolean
          error?: string | null
          id?: string
          lead_created?: boolean
          lead_id?: string | null
          lead_table?: string | null
          post_id?: string | null
          qualified?: boolean
          replied?: boolean
          reply_content?: string | null
          spin_stage?: string | null
          type: string
          unipile_event_id?: string | null
          user_id: string
        }
        Update: {
          actor_handle?: string | null
          actor_name?: string | null
          actor_profile_url?: string | null
          actor_provider_id?: string | null
          channel?: string
          content?: string | null
          created_at?: string
          dm_content?: string | null
          dm_sent?: boolean
          error?: string | null
          id?: string
          lead_created?: boolean
          lead_id?: string | null
          lead_table?: string | null
          post_id?: string | null
          qualified?: boolean
          replied?: boolean
          reply_content?: string | null
          spin_stage?: string | null
          type?: string
          unipile_event_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_interactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_templates: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          format: string
          icon: string | null
          id: string
          name: string
          slide_count: number | null
          slug: string
          sort_order: number | null
          structure: Json
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          format: string
          icon?: string | null
          id?: string
          name: string
          slide_count?: number | null
          slug: string
          sort_order?: number | null
          structure?: Json
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          format?: string
          icon?: string | null
          id?: string
          name?: string
          slide_count?: number | null
          slug?: string
          sort_order?: number | null
          structure?: Json
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          ai_model: string | null
          ai_prompt: string | null
          auto_approve: boolean
          auto_comment_reply: string | null
          auto_dm_cta_label: string | null
          auto_dm_enabled: boolean
          auto_dm_link: string | null
          auto_dm_message: string | null
          auto_dm_on_follow: boolean
          auto_dm_on_like: boolean
          auto_dm_trigger_keyword: string | null
          caption: string | null
          carousel_fonts: Json | null
          carousel_slides: Json | null
          carousel_template: string | null
          channel: string
          comments_count: number
          cover_url: string | null
          created_at: string
          dms_sent: number
          hashtags: string | null
          id: string
          last_error: string | null
          leads_created: number
          likes: number
          media_type: string
          media_urls: Json
          metrics_synced_at: string | null
          plan_id: string | null
          post_format: string | null
          post_url: string | null
          product_id: string | null
          published_at: string | null
          reel_caption_style: Json | null
          reel_captions: Json | null
          reel_rendered_url: string | null
          reel_source_url: string | null
          reference_asset_ids: string[] | null
          scheduled_at: string | null
          slide_data: Json | null
          source_image_url: string | null
          status: string
          template_slug: string | null
          unipile_account_id: string | null
          unipile_post_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_model?: string | null
          ai_prompt?: string | null
          auto_approve?: boolean
          auto_comment_reply?: string | null
          auto_dm_cta_label?: string | null
          auto_dm_enabled?: boolean
          auto_dm_link?: string | null
          auto_dm_message?: string | null
          auto_dm_on_follow?: boolean
          auto_dm_on_like?: boolean
          auto_dm_trigger_keyword?: string | null
          caption?: string | null
          carousel_fonts?: Json | null
          carousel_slides?: Json | null
          carousel_template?: string | null
          channel: string
          comments_count?: number
          cover_url?: string | null
          created_at?: string
          dms_sent?: number
          hashtags?: string | null
          id?: string
          last_error?: string | null
          leads_created?: number
          likes?: number
          media_type?: string
          media_urls?: Json
          metrics_synced_at?: string | null
          plan_id?: string | null
          post_format?: string | null
          post_url?: string | null
          product_id?: string | null
          published_at?: string | null
          reel_caption_style?: Json | null
          reel_captions?: Json | null
          reel_rendered_url?: string | null
          reel_source_url?: string | null
          reference_asset_ids?: string[] | null
          scheduled_at?: string | null
          slide_data?: Json | null
          source_image_url?: string | null
          status?: string
          template_slug?: string | null
          unipile_account_id?: string | null
          unipile_post_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_model?: string | null
          ai_prompt?: string | null
          auto_approve?: boolean
          auto_comment_reply?: string | null
          auto_dm_cta_label?: string | null
          auto_dm_enabled?: boolean
          auto_dm_link?: string | null
          auto_dm_message?: string | null
          auto_dm_on_follow?: boolean
          auto_dm_on_like?: boolean
          auto_dm_trigger_keyword?: string | null
          caption?: string | null
          carousel_fonts?: Json | null
          carousel_slides?: Json | null
          carousel_template?: string | null
          channel?: string
          comments_count?: number
          cover_url?: string | null
          created_at?: string
          dms_sent?: number
          hashtags?: string | null
          id?: string
          last_error?: string | null
          leads_created?: number
          likes?: number
          media_type?: string
          media_urls?: Json
          metrics_synced_at?: string | null
          plan_id?: string | null
          post_format?: string | null
          post_url?: string | null
          product_id?: string | null
          published_at?: string | null
          reel_caption_style?: Json | null
          reel_captions?: Json | null
          reel_rendered_url?: string | null
          reel_source_url?: string | null
          reference_asset_ids?: string[] | null
          scheduled_at?: string | null
          slide_data?: Json | null
          source_image_url?: string | null
          status?: string
          template_slug?: string | null
          unipile_account_id?: string | null
          unipile_post_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "social_content_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "social_products"
            referencedColumns: ["id"]
          },
        ]
      }
      social_products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          docs: Json | null
          features: Json | null
          id: string
          is_default: boolean
          link: string | null
          name: string
          pains: Json | null
          target_audience: string | null
          updated_at: string
          user_id: string
          voice_tone: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          docs?: Json | null
          features?: Json | null
          id?: string
          is_default?: boolean
          link?: string | null
          name: string
          pains?: Json | null
          target_audience?: string | null
          updated_at?: string
          user_id: string
          voice_tone?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          docs?: Json | null
          features?: Json | null
          id?: string
          is_default?: boolean
          link?: string | null
          name?: string
          pains?: Json | null
          target_audience?: string | null
          updated_at?: string
          user_id?: string
          voice_tone?: string | null
        }
        Relationships: []
      }
      social_reference_pages: {
        Row: {
          active: boolean | null
          brand_data: Json | null
          created_at: string | null
          cta: string | null
          features: Json | null
          id: string
          label: string | null
          last_scraped_at: string | null
          og_image_url: string | null
          raw_text: string | null
          summary: string | null
          title: string | null
          updated_at: string | null
          url: string
          user_id: string
          value_props: Json | null
        }
        Insert: {
          active?: boolean | null
          brand_data?: Json | null
          created_at?: string | null
          cta?: string | null
          features?: Json | null
          id?: string
          label?: string | null
          last_scraped_at?: string | null
          og_image_url?: string | null
          raw_text?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string | null
          url: string
          user_id: string
          value_props?: Json | null
        }
        Update: {
          active?: boolean | null
          brand_data?: Json | null
          created_at?: string | null
          cta?: string | null
          features?: Json | null
          id?: string
          label?: string | null
          last_scraped_at?: string | null
          og_image_url?: string | null
          raw_text?: string | null
          summary?: string | null
          title?: string | null
          updated_at?: string | null
          url?: string
          user_id?: string
          value_props?: Json | null
        }
        Relationships: []
      }
      social_scheduled_followups: {
        Row: {
          account_id: string
          actor_handle: string | null
          actor_name: string | null
          actor_provider_id: string
          attempts: number
          channel: string
          context: Json | null
          created_at: string
          error: string | null
          id: string
          message: string
          rule_id: string | null
          scheduled_at: string
          sent: boolean
          sent_at: string | null
          updated_at: string
          use_ai: boolean
          user_id: string
        }
        Insert: {
          account_id: string
          actor_handle?: string | null
          actor_name?: string | null
          actor_provider_id: string
          attempts?: number
          channel: string
          context?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          message: string
          rule_id?: string | null
          scheduled_at: string
          sent?: boolean
          sent_at?: string | null
          updated_at?: string
          use_ai?: boolean
          user_id: string
        }
        Update: {
          account_id?: string
          actor_handle?: string | null
          actor_name?: string | null
          actor_provider_id?: string
          attempts?: number
          channel?: string
          context?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          message?: string
          rule_id?: string | null
          scheduled_at?: string
          sent?: boolean
          sent_at?: string | null
          updated_at?: string
          use_ai?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_scheduled_followups_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "social_auto_engage_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachments: Json
          content: string | null
          created_at: string
          id: string
          read_by_admin: boolean
          read_by_user: boolean
          sender_id: string
          sender_role: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          content?: string | null
          created_at?: string
          id?: string
          read_by_admin?: boolean
          read_by_user?: boolean
          sender_id: string
          sender_role: string
          user_id: string
        }
        Update: {
          attachments?: Json
          content?: string | null
          created_at?: string
          id?: string
          read_by_admin?: boolean
          read_by_user?: boolean
          sender_id?: string
          sender_role?: string
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
      telegram_recipients: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          identifier: string
          last_error: string | null
          last_message: string | null
          provider_chat_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          identifier: string
          last_error?: string | null
          last_message?: string | null
          provider_chat_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          identifier?: string
          last_error?: string | null
          last_message?: string | null
          provider_chat_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          api_key: string
          created_at: string
          extra: Json | null
          id: string
          is_admin_shared: boolean
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          extra?: Json | null
          id?: string
          is_admin_shared?: boolean
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          extra?: Json | null
          id?: string
          is_admin_shared?: boolean
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          created_at: string
          evolution_instance: string | null
          id: string
          linkedin_cadence_enabled: boolean
          mandrack_instance_id: string | null
          mandrack_instance_token: string | null
          n8n_api_key: string | null
          n8n_api_url: string | null
          n8n_mcp_token: string | null
          n8n_mcp_url: string | null
          n8n_webhook_dispatch_url: string | null
          n8n_webhook_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evolution_instance?: string | null
          id?: string
          linkedin_cadence_enabled?: boolean
          mandrack_instance_id?: string | null
          mandrack_instance_token?: string | null
          n8n_api_key?: string | null
          n8n_api_url?: string | null
          n8n_mcp_token?: string | null
          n8n_mcp_url?: string | null
          n8n_webhook_dispatch_url?: string | null
          n8n_webhook_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evolution_instance?: string | null
          id?: string
          linkedin_cadence_enabled?: boolean
          mandrack_instance_id?: string | null
          mandrack_instance_token?: string | null
          n8n_api_key?: string | null
          n8n_api_url?: string | null
          n8n_mcp_token?: string | null
          n8n_mcp_url?: string | null
          n8n_webhook_dispatch_url?: string | null
          n8n_webhook_url?: string | null
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
          role: Database["public"]["Enums"]["app_role"]
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
      whatsapp_group_leads: {
        Row: {
          created_at: string
          data_disparo: string | null
          disparo: string | null
          group_jid: string
          group_name: string | null
          id: string
          member_jid: string
          mensagem: string | null
          phone: string | null
          pushname: string | null
          scraped_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_disparo?: string | null
          disparo?: string | null
          group_jid: string
          group_name?: string | null
          id?: string
          member_jid: string
          mensagem?: string | null
          phone?: string | null
          pushname?: string | null
          scraped_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_disparo?: string | null
          disparo?: string | null
          group_jid?: string
          group_name?: string | null
          id?: string
          member_jid?: string
          mensagem?: string | null
          phone?: string | null
          pushname?: string | null
          scraped_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          active: boolean
          created_at: string
          daily_limit: number
          failure_count: number
          id: string
          instance_name: string
          last_failure_at: string | null
          last_health_check_at: string | null
          last_used_at: string | null
          mandrack_instance_id: string | null
          mandrack_instance_token: string
          paused: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_limit?: number
          failure_count?: number
          id?: string
          instance_name: string
          last_failure_at?: string | null
          last_health_check_at?: string | null
          last_used_at?: string | null
          mandrack_instance_id?: string | null
          mandrack_instance_token: string
          paused?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_limit?: number
          failure_count?: number
          id?: string
          instance_name?: string
          last_failure_at?: string | null
          last_health_check_at?: string | null
          last_used_at?: string | null
          mandrack_instance_id?: string | null
          mandrack_instance_token?: string
          paused?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      leads_unified: {
        Row: {
          contexto: string | null
          created_at: string | null
          data_disparo: string | null
          disparo: string | null
          empresa: string | null
          extra: Json | null
          identificador: string | null
          nome: string | null
          source: string | null
          source_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_dispatch_item: {
        Args: { _id: string }
        Returns: {
          attempts: number
          id: string
          user_id: string
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      finalize_qualification_response: {
        Args: {
          _audio_url: string
          _content: string
          _conversation_id: string
          _evolution_response: Json
          _pending_ids: string[]
          _telefone: string
          _user_id: string
        }
        Returns: undefined
      }
      get_ai_key_for_user: {
        Args: { _provider: string; _user_id: string }
        Returns: string
      }
      get_apify_key_for_user: { Args: { _user: string }; Returns: string }
      get_chip_health_metrics: { Args: never; Returns: Json }
      get_dispatch_metrics: { Args: { _days?: number }; Returns: Json }
      get_worker_metrics: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_knowledge_chunks: {
        Args: { _match_count?: number; _query: string; _user_id: string }
        Returns: {
          content: string
          similarity: number
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
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      pipeline_stage:
        | "prospectado"
        | "follow_up_1"
        | "follow_up_2"
        | "follow_up_3"
        | "negociando"
        | "fechado"
        | "perdido"
        | "novo_lead"
        | "primeiro_contato"
        | "qualificando"
        | "proposta_enviada"
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
      app_role: ["admin", "user"],
      pipeline_stage: [
        "prospectado",
        "follow_up_1",
        "follow_up_2",
        "follow_up_3",
        "negociando",
        "fechado",
        "perdido",
        "novo_lead",
        "primeiro_contato",
        "qualificando",
        "proposta_enviada",
      ],
    },
  },
} as const
