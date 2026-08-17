-- Mini-fase Knowledge: enriquece mavi_briefing com 4 dimensões que faltavam
-- para a MAVI ter contexto comercial real da AGREGA (personas decisoras,
-- clientes-referência por prova social, value props consultivos e banco SPIN
-- específico do nicho). Os 3 workers (dispatch, qualification, linkedin-dm)
-- passam a injetar esses campos no briefing automaticamente.

ALTER TABLE public.mavi_briefing
  ADD COLUMN IF NOT EXISTS personas_alvo text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS clientes_referencia text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS value_props text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS spin_bank jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.mavi_briefing.personas_alvo IS
  'Cargos decisores que a MAVI deve buscar e abordar (ex: Gerente Financeiro, Controller). Usado nos workers + filtro LinkedIn.';
COMMENT ON COLUMN public.mavi_briefing.clientes_referencia IS
  'Lista de clientes reais para prova social. MAVI cita 1-2 quando o lead estiver no mesmo setor.';
COMMENT ON COLUMN public.mavi_briefing.value_props IS
  'Propostas de valor consultivas. MAVI usa SOMENTE na fase N (Need Payoff) — NUNCA na abertura.';
COMMENT ON COLUMN public.mavi_briefing.spin_bank IS
  'Banco de perguntas SPIN por fase: {situacao:[],problema:[],implicacao:[],need_payoff:[]}. Inspiração contextual, não literal.';
