
CREATE TYPE public.pipeline_stage AS ENUM ('prospectado','follow_up_1','follow_up_2','follow_up_3','negociando','fechado','perdido');

CREATE TABLE public.pipeline_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  nome_empresa TEXT,
  contato TEXT,
  telefone TEXT,
  email TEXT,
  estagio public.pipeline_stage NOT NULL DEFAULT 'prospectado',
  origem TEXT,
  valor_estimado NUMERIC,
  observacoes TEXT,
  proximo_followup_at TIMESTAMPTZ,
  position INTEGER NOT NULL DEFAULT 0,
  source_table TEXT,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pipeline_cards" ON public.pipeline_cards
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Users insert own pipeline_cards" ON public.pipeline_cards
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own pipeline_cards" ON public.pipeline_cards
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Users delete own pipeline_cards" ON public.pipeline_cards
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER update_pipeline_cards_updated_at
  BEFORE UPDATE ON public.pipeline_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pipeline_cards_user_estagio ON public.pipeline_cards(user_id, estagio, position);

CREATE TABLE public.pipeline_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  card_id UUID NOT NULL REFERENCES public.pipeline_cards(id) ON DELETE CASCADE,
  from_stage public.pipeline_stage,
  to_stage public.pipeline_stage NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pipeline_history" ON public.pipeline_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Users insert own pipeline_history" ON public.pipeline_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own pipeline_history" ON public.pipeline_history
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role));
