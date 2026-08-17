
ALTER TABLE public.client_subscriptions
  ADD COLUMN IF NOT EXISTS coex_chatwoot_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS setup_fee_paid numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rebuilds_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rebuilds_limit integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS use_admin_credentials boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_phone text;
