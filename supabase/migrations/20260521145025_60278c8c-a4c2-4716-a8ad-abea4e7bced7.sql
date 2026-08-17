ALTER TABLE public.user_integrations
ADD COLUMN IF NOT EXISTS linkedin_cadence_enabled boolean NOT NULL DEFAULT false;