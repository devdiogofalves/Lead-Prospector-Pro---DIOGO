UPDATE public.automation_settings SET run_linkedin = true, updated_at = now() WHERE user_id IN (SELECT user_id FROM public.user_integrations WHERE linkedin_cadence_enabled = true) AND run_linkedin = false;

ALTER TABLE public.automation_settings ALTER COLUMN run_linkedin SET DEFAULT true;