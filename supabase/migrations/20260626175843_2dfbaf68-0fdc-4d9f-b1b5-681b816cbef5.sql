ALTER TABLE public.dispatch_settings 
  ADD COLUMN IF NOT EXISTS whatsapp_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS instagram_paused boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS telegram_paused boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS linkedin_paused boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS messenger_paused boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS instagram_daily_limit integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS telegram_daily_limit integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS linkedin_daily_limit integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS messenger_daily_limit integer NOT NULL DEFAULT 20;