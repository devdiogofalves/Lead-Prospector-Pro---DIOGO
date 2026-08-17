ALTER TABLE public.company_branding
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_cta_label TEXT;