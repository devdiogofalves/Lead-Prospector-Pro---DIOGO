-- Frente 2: novos toggles e gatilhos
ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS run_linkedin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkedin_search_terms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS min_score_360 integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS require_partner_mobile boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_whatsapp_validated boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_partner_identified boolean NOT NULL DEFAULT true;

-- Frente 3: briefing AGREGA + outcomes para aprendizado MAVI
CREATE TABLE IF NOT EXISTS public.mavi_briefing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  icp_descricao text,
  segmentos_alvo text[] NOT NULL DEFAULT '{}',
  portes_alvo text[] NOT NULL DEFAULT '{}',
  gatilhos_compra text[] NOT NULL DEFAULT '{}',
  objecoes_comuns text[] NOT NULL DEFAULT '{}',
  abordagem_preferida text,
  learned_patterns jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_learned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mavi_briefing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own briefing" ON public.mavi_briefing
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own briefing" ON public.mavi_briefing
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own briefing" ON public.mavi_briefing
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users delete own briefing" ON public.mavi_briefing
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_mavi_briefing_updated_at
  BEFORE UPDATE ON public.mavi_briefing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.mavi_conversation_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  outcome text NOT NULL,
  objection_type text,
  segment text,
  porte text,
  spin_phase_reached text,
  opening_used text,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_mavi_outcomes_user ON public.mavi_conversation_outcomes(user_id, created_at DESC);

ALTER TABLE public.mavi_conversation_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own outcomes" ON public.mavi_conversation_outcomes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own outcomes" ON public.mavi_conversation_outcomes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own outcomes" ON public.mavi_conversation_outcomes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users delete own outcomes" ON public.mavi_conversation_outcomes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));