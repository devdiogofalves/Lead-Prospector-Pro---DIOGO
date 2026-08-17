-- Extensions for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Automation settings table
CREATE TABLE IF NOT EXISTS public.automation_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  frequency_hours INTEGER NOT NULL DEFAULT 24,
  max_leads_per_run INTEGER NOT NULL DEFAULT 20,
  run_maps BOOLEAN NOT NULL DEFAULT true,
  run_instagram BOOLEAN NOT NULL DEFAULT true,
  run_cnpj_enrich BOOLEAN NOT NULL DEFAULT true,
  run_dispatch BOOLEAN NOT NULL DEFAULT false,
  maps_niches TEXT[] NOT NULL DEFAULT '{}',
  maps_regions TEXT[] NOT NULL DEFAULT '{}',
  ig_hashtags TEXT[] NOT NULL DEFAULT '{}',
  ig_target_accounts TEXT[] NOT NULL DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ DEFAULT now(),
  last_run_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own automation_settings"
  ON public.automation_settings FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own automation_settings"
  ON public.automation_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own automation_settings"
  ON public.automation_settings FOR UPDATE
  TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users delete own automation_settings"
  ON public.automation_settings FOR DELETE
  TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_automation_settings_updated_at
  BEFORE UPDATE ON public.automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_automation_next_run
  ON public.automation_settings(next_run_at)
  WHERE enabled = true;