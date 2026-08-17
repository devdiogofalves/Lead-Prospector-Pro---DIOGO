ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS n8n_webhook_dispatch_url text,
  ADD COLUMN IF NOT EXISTS n8n_api_url text,
  ADD COLUMN IF NOT EXISTS n8n_api_key text;