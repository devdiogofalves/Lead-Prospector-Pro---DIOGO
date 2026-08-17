-- Planos e assinaturas de clientes LeadsBooster (Fase SaaS).
-- Vincula cada usuário ao plano Kiwify comprado e define limites de recursos.
-- Preenchido automaticamente pelo kiwify-webhook a cada compra/cancelamento.

CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                    text NOT NULL DEFAULT 'trial',
  -- trial | starter | pro | agency | whitelabel
  status                  text NOT NULL DEFAULT 'active',
  -- active | paused | canceled
  kiwify_subscription_id  text,
  kiwify_order_id         text,
  kiwify_product_id       text,
  -- Limites de recursos (NULL = ilimitado)
  chips_limit             integer,        -- max chips WhatsApp simultâneos
  dispatches_daily_limit  integer,        -- max envios/dia (todos os chips)
  -- Feature flags
  linkedin_enabled        boolean NOT NULL DEFAULT false,
  instagram_enabled       boolean NOT NULL DEFAULT false,
  email_dispatch_enabled  boolean NOT NULL DEFAULT false,
  reseller_enabled        boolean NOT NULL DEFAULT false,
  -- Reseller: quem criou esta conta (NULL = compra direta no Kiwify)
  reseller_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Billing
  trial_ends_at           timestamptz,
  current_period_start    timestamptz DEFAULT now(),
  current_period_end      timestamptz,
  canceled_at             timestamptz,
  notes                   text,           -- anotações internas do admin
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_sub_user     ON public.client_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_client_sub_plan     ON public.client_subscriptions(plan);
CREATE INDEX IF NOT EXISTS idx_client_sub_reseller ON public.client_subscriptions(reseller_id);
CREATE INDEX IF NOT EXISTS idx_client_sub_status   ON public.client_subscriptions(status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_client_subscriptions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_client_sub_updated ON public.client_subscriptions;
CREATE TRIGGER trg_client_sub_updated
  BEFORE UPDATE ON public.client_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_subscriptions();

-- RLS: cada usuário vê apenas a própria linha; service role (edge functions) gerencia tudo
ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub: user reads own"
  ON public.client_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sub: user updates own"
  ON public.client_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

COMMENT ON TABLE  public.client_subscriptions IS 'Plano e limites de cada cliente. Gerenciado pelo kiwify-webhook e admin-manage-client.';
COMMENT ON COLUMN public.client_subscriptions.plan IS 'trial | starter | pro | agency | whitelabel';
COMMENT ON COLUMN public.client_subscriptions.reseller_enabled IS 'true = conta pode criar sub-contas e revender via /reseller';
COMMENT ON COLUMN public.client_subscriptions.reseller_id IS 'ID do revendedor que criou esta conta (NULL = compra direta)';
