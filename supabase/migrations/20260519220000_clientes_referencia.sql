-- Adiciona coluna clientes_referencia (faltante) — Fase H
ALTER TABLE public.mavi_briefing
  ADD COLUMN IF NOT EXISTS clientes_referencia text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.mavi_briefing.clientes_referencia IS
  'Lista de empresas-referência (clientes AGREGA) usadas como semente para sementeira CNAE/Maps.';
