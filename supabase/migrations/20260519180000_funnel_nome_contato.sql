-- Fase F: foundation fix do funil end-to-end
-- Adiciona nome_contato + cargo em dispatch_queue, qualification_conversations
-- e pipeline_cards para que o nome do SÓCIO identificado via CNPJ
-- (não só nome_empresa) flua através do funil inteiro:
--   auto-prospect → dispatch_queue → dispatch-worker (prompt IA)
--                                  → qualification_conversations
--                                  → pipeline_cards.contato

ALTER TABLE public.dispatch_queue
  ADD COLUMN IF NOT EXISTS nome_contato text,
  ADD COLUMN IF NOT EXISTS cargo text;

ALTER TABLE public.qualification_conversations
  ADD COLUMN IF NOT EXISTS nome_contato text,
  ADD COLUMN IF NOT EXISTS cargo text;

COMMENT ON COLUMN public.dispatch_queue.nome_contato IS
  'Nome do sócio/contato específico identificado via CNPJ (não a empresa). Usado pelo dispatch-worker para personalizar a abordagem MAVI.';
COMMENT ON COLUMN public.dispatch_queue.cargo IS
  'Cargo do contato (ex: Administrador, Diretor Financeiro). Inferido do QSA do CNPJ.';
COMMENT ON COLUMN public.qualification_conversations.nome_contato IS
  'Nome real da pessoa que está conversando com a MAVI. Diferente de nome_empresa.';
COMMENT ON COLUMN public.qualification_conversations.cargo IS
  'Cargo do contato — preservado desde a fase de prospecção.';
