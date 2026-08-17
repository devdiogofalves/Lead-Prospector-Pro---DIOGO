
-- Add missing column on qualification_settings
ALTER TABLE public.qualification_settings
  ADD COLUMN IF NOT EXISTS attendant_instance_id uuid;

-- Create client_subscriptions table (was documented but missing)
CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'trial',
  status text NOT NULL DEFAULT 'active',
  chips_limit integer,
  dispatches_daily_limit integer,
  linkedin_enabled boolean NOT NULL DEFAULT false,
  instagram_enabled boolean NOT NULL DEFAULT false,
  email_dispatch_enabled boolean NOT NULL DEFAULT false,
  reseller_enabled boolean NOT NULL DEFAULT false,
  reseller_id uuid,
  kiwify_subscription_id text,
  kiwify_order_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_subscriptions TO authenticated;
GRANT ALL ON public.client_subscriptions TO service_role;

ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscription"
  ON public.client_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = reseller_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage subscriptions"
  ON public.client_subscriptions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Resellers manage their clients"
  ON public.client_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = reseller_id)
  WITH CHECK (auth.uid() = reseller_id);
