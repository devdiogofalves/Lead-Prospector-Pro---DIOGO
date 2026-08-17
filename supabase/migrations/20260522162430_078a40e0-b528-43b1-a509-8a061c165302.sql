-- 1) whatsapp_instances
CREATE TABLE public.whatsapp_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  instance_name text NOT NULL,
  mandrack_instance_id text,
  mandrack_instance_token text NOT NULL,
  daily_limit integer NOT NULL DEFAULT 15,
  active boolean NOT NULL DEFAULT true,
  paused boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'unknown',
  last_used_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, instance_name)
);

CREATE INDEX idx_whatsapp_instances_user ON public.whatsapp_instances(user_id);
CREATE INDEX idx_whatsapp_instances_active ON public.whatsapp_instances(user_id, active, paused);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own whatsapp_instances" ON public.whatsapp_instances
  FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own whatsapp_instances" ON public.whatsapp_instances
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own whatsapp_instances" ON public.whatsapp_instances
  FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users delete own whatsapp_instances" ON public.whatsapp_instances
  FOR DELETE TO authenticated USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_whatsapp_instances_updated
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) dispatch_queue: which chip will send
ALTER TABLE public.dispatch_queue ADD COLUMN IF NOT EXISTS whatsapp_instance_id uuid;
CREATE INDEX IF NOT EXISTS idx_dispatch_queue_instance ON public.dispatch_queue(whatsapp_instance_id);

-- 3) qualification_conversations: which chip owns the conversation
ALTER TABLE public.qualification_conversations ADD COLUMN IF NOT EXISTS whatsapp_instance_id uuid;

-- 4) Migrate existing user_integrations -> whatsapp_instances (1 row per existing chip)
INSERT INTO public.whatsapp_instances
  (user_id, instance_name, mandrack_instance_id, mandrack_instance_token, daily_limit, active, paused, status)
SELECT
  user_id,
  evolution_instance,
  mandrack_instance_id,
  mandrack_instance_token,
  15,
  true,
  false,
  'migrated'
FROM public.user_integrations
WHERE evolution_instance IS NOT NULL
  AND mandrack_instance_token IS NOT NULL
ON CONFLICT (user_id, instance_name) DO NOTHING;