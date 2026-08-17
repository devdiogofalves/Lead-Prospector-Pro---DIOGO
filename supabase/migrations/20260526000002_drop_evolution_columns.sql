-- Remove colunas legadas da Evolution API (completamente substituída pelo Mandrack + whatsapp_instances).
-- Colunas user_integrations.evolution_instance e evolution_api_url não são mais lidas por nenhum
-- worker ativo (dispatch-worker, qualification-worker, mandrack-manager) — todos usam
-- whatsapp_instances.mandrack_instance_token com fallback para user_integrations.mandrack_instance_token.
-- A coluna qualification_messages.evolution_response é mantida pois armazena respostas históricas
-- da API (independente de qual provider) e seria perda de dado removê-la agora.

ALTER TABLE public.user_integrations
  DROP COLUMN IF EXISTS evolution_api_url;

-- evolution_instance é mantida como fallback de nome de instância no resolveWA legado.
-- Será removida em migração futura após todos os registros serem migrados para whatsapp_instances.
-- ALTER TABLE public.user_integrations DROP COLUMN IF EXISTS evolution_instance;
