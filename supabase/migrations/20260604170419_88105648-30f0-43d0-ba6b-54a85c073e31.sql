
-- ============== CAMPAIGNS ==============
CREATE TABLE public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|scheduled|sending|paused|completed
  source_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  chips_ids UUID[] NOT NULL DEFAULT '{}',
  sequence JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ordem,delay_hours,mensagem,use_audio,gerado_por_ia}]
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  replied_count INTEGER NOT NULL DEFAULT 0,
  qualified_count INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own campaigns" ON public.campaigns FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own campaigns" ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own campaigns" ON public.campaigns FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users delete own campaigns" ON public.campaigns FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_campaigns_user ON public.campaigns(user_id, created_at DESC);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);

-- ============== CAMPAIGN RECIPIENTS ==============
CREATE TABLE public.campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  source TEXT NOT NULL,
  source_id UUID,
  telefone TEXT NOT NULL,
  nome_empresa TEXT,
  nome_contato TEXT,
  cargo TEXT,
  step_atual INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|active|completed|failed|replied
  dispatch_queue_ids UUID[] NOT NULL DEFAULT '{}',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_recipients TO authenticated;
GRANT ALL ON public.campaign_recipients TO service_role;

ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own campaign_recipients" ON public.campaign_recipients FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users insert own campaign_recipients" ON public.campaign_recipients FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own campaign_recipients" ON public.campaign_recipients FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users delete own campaign_recipients" ON public.campaign_recipients FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_campaign_recipients_updated_at BEFORE UPDATE ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_camp_recipients_campaign ON public.campaign_recipients(campaign_id);
CREATE INDEX idx_camp_recipients_telefone ON public.campaign_recipients(telefone);
CREATE INDEX idx_camp_recipients_status ON public.campaign_recipients(status);

-- ============== DISPATCH QUEUE LINK ==============
ALTER TABLE public.dispatch_queue
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sequence_step INTEGER;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_campaign ON public.dispatch_queue(campaign_id);
