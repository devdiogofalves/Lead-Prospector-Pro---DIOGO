-- Fase H-2: cache de atividades CNAE dos clientes-referência AGREGA
--
-- Antes (Fase H): maps-seed-by-references usava `segmentos_alvo` do briefing
-- (texto genérico: "construção civil", "cimenteiras", "têxtil") como queries
-- pro Google Maps. Funcional mas amplo demais — "cimenteiras em SP" traz
-- desde grandes fabricantes até pequenas distribuidoras.
--
-- Agora (Fase H-2): edge function resolve-references-activities resolve o
-- CNAE/atividade_principal real de cada cliente_referencia (Apodi → "Fabricação
-- de cimento", Marisol → "Fabricação de roupas íntimas") via cnpj-search-by-name
-- + cnpj-lookup. Resultado cacheado nesta coluna pra evitar repetir as ~10
-- chamadas Apify a cada execução. Refresh manual via botão no UI.

ALTER TABLE public.mavi_briefing
  ADD COLUMN IF NOT EXISTS clientes_referencia_atividades text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS clientes_referencia_atividades_at timestamptz;

COMMENT ON COLUMN public.mavi_briefing.clientes_referencia_atividades IS
  'Atividades CNAE resolvidas via API CNPJ a partir de clientes_referencia. Usadas pela maps-seed-by-references pra sementeira mais precisa.';
COMMENT ON COLUMN public.mavi_briefing.clientes_referencia_atividades_at IS
  'Quando o cache foi populado pela última vez. Operador pode forçar refresh via /mavi-aprendizado.';
