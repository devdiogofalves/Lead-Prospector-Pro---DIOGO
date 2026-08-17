
ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS auto_whatsapp_enabled  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_email_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_instagram_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_telegram_enabled  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_linkedin_dm_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS ignore_business_hours BOOLEAN NOT NULL DEFAULT false;
