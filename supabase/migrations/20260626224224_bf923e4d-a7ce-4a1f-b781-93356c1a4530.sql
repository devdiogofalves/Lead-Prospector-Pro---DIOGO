
-- 1) Novos campos em social_auto_engage_rules
ALTER TABLE public.social_auto_engage_rules
  ADD COLUMN IF NOT EXISTS ai_tone TEXT DEFAULT 'casual',
  ADD COLUMN IF NOT EXISTS default_link TEXT,
  ADD COLUMN IF NOT EXISTS require_follower BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_delay_hours INTEGER,
  ADD COLUMN IF NOT EXISTS followup_message TEXT,
  ADD COLUMN IF NOT EXISTS followup_use_ai BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS move_to_dm_on_interest BOOLEAN NOT NULL DEFAULT true;

-- 2) Fila de follow-ups agendados
CREATE TABLE IF NOT EXISTS public.social_scheduled_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  rule_id UUID REFERENCES public.social_auto_engage_rules(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  account_id TEXT NOT NULL,
  actor_provider_id TEXT NOT NULL,
  actor_name TEXT,
  actor_handle TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  message TEXT NOT NULL,
  use_ai BOOLEAN NOT NULL DEFAULT false,
  context JSONB,
  sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssf_due
  ON public.social_scheduled_followups (scheduled_at)
  WHERE sent = false;

CREATE INDEX IF NOT EXISTS idx_ssf_user
  ON public.social_scheduled_followups (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_scheduled_followups TO authenticated;
GRANT ALL ON public.social_scheduled_followups TO service_role;

ALTER TABLE public.social_scheduled_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own followups"
  ON public.social_scheduled_followups
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_ssf_updated_at
  BEFORE UPDATE ON public.social_scheduled_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
