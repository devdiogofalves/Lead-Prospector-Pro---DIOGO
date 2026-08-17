ALTER TABLE public.mavi_briefing
  ADD COLUMN IF NOT EXISTS personas_alvo text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS clientes_referencia text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS value_props text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS spin_bank jsonb NOT NULL DEFAULT '{"situacao":[],"problema":[],"implicacao":[],"need_payoff":[]}'::jsonb;