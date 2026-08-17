ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS mandrack_instance_id text,
  ADD COLUMN IF NOT EXISTS mandrack_instance_token text;