CREATE TABLE public.user_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  api_key TEXT NOT NULL,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own keys" ON public.user_api_keys
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own keys" ON public.user_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own keys" ON public.user_api_keys
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own keys" ON public.user_api_keys
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_api_keys_updated
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  n8n_webhook_url TEXT,
  n8n_mcp_url TEXT,
  n8n_mcp_token TEXT,
  evolution_instance TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own integrations" ON public.user_integrations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own integrations" ON public.user_integrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own integrations" ON public.user_integrations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own integrations" ON public.user_integrations
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_integrations_updated
  BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();