CREATE TABLE public.prospecting_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() UNIQUE,
  produto TEXT,
  publico_alvo TEXT,
  ticket_medio TEXT,
  regiao TEXT,
  diferenciais TEXT,
  ja_tentou TEXT,
  plan JSONB,
  system_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prospecting_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own prospecting_profiles" ON public.prospecting_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "Users insert own prospecting_profiles" ON public.prospecting_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own prospecting_profiles" ON public.prospecting_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own prospecting_profiles" ON public.prospecting_profiles
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_prospecting_profiles_updated_at
  BEFORE UPDATE ON public.prospecting_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();