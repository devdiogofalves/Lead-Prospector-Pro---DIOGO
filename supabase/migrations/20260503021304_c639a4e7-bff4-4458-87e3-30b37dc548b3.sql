
-- ============ dispatch_settings ============
CREATE TABLE IF NOT EXISTS public.dispatch_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  paused BOOLEAN NOT NULL DEFAULT false,
  min_delay_seconds INTEGER NOT NULL DEFAULT 45,
  max_delay_seconds INTEGER NOT NULL DEFAULT 180,
  business_hour_start INTEGER NOT NULL DEFAULT 9,
  business_hour_end INTEGER NOT NULL DEFAULT 18,
  respect_business_hours BOOLEAN NOT NULL DEFAULT true,
  daily_limit INTEGER NOT NULL DEFAULT 80,
  use_audio BOOLEAN NOT NULL DEFAULT true,
  audio_ratio NUMERIC NOT NULL DEFAULT 0.25,
  proxy_url TEXT,
  warmup_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dispatch_settings" ON public.dispatch_settings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own dispatch_settings" ON public.dispatch_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own dispatch_settings" ON public.dispatch_settings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own dispatch_settings" ON public.dispatch_settings
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_dispatch_settings_updated
  BEFORE UPDATE ON public.dispatch_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ dispatch_queue ============
CREATE TABLE IF NOT EXISTS public.dispatch_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  source TEXT NOT NULL,
  source_id UUID,
  nome_empresa TEXT,
  telefone TEXT NOT NULL,
  mensagem TEXT,
  audio_url TEXT,
  send_as_audio BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  proxy_url TEXT,
  evolution_response JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_status_scheduled
  ON public.dispatch_queue (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_dispatch_queue_user
  ON public.dispatch_queue (user_id, status);

ALTER TABLE public.dispatch_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dispatch_queue" ON public.dispatch_queue
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own dispatch_queue" ON public.dispatch_queue
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own dispatch_queue" ON public.dispatch_queue
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users delete own dispatch_queue" ON public.dispatch_queue
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_dispatch_queue_updated
  BEFORE UPDATE ON public.dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ pg_cron + pg_net ============
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
