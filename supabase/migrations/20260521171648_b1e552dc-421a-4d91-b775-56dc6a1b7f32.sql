ALTER TABLE public.automation_settings
ADD COLUMN IF NOT EXISTS auto_socio_linkedin boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_socio_linkedin_start_cadence boolean NOT NULL DEFAULT false;