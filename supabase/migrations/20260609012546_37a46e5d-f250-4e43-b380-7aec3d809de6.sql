
ALTER TABLE public.dispatch_queue
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS html_body TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS unipile_account_id TEXT;

ALTER TABLE public.dispatch_queue
  ALTER COLUMN telefone DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_channel ON public.dispatch_queue(channel, status, scheduled_at);

ALTER TABLE public.dispatch_settings
  ADD COLUMN IF NOT EXISTS email_paused BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_daily_limit INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS email_from_name TEXT,
  ADD COLUMN IF NOT EXISTS email_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS email_min_delay_seconds INTEGER NOT NULL DEFAULT 15;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email_disparo TEXT NOT NULL DEFAULT 'Não';
ALTER TABLE public.instagram_contacts ADD COLUMN IF NOT EXISTS email_disparo TEXT NOT NULL DEFAULT 'Não';
ALTER TABLE public.linkedin_contacts ADD COLUMN IF NOT EXISTS email_disparo TEXT NOT NULL DEFAULT 'Não';
ALTER TABLE public.empresas_enriquecidas ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.empresas_enriquecidas ADD COLUMN IF NOT EXISTS email_disparo TEXT NOT NULL DEFAULT 'Não';
