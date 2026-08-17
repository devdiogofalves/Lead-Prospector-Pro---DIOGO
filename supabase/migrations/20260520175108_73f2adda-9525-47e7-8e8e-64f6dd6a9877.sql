ALTER TABLE public.linkedin_contacts
  ADD COLUMN IF NOT EXISTS cadencia_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS etapa_atual text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS data_prox_disparo timestamptz,
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS unipile_chat_id text,
  ADD COLUMN IF NOT EXISTS unipile_account_id text,
  ADD COLUMN IF NOT EXISTS ultima_resposta_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_resposta_texto text,
  ADD COLUMN IF NOT EXISTS conexao_aceita_em timestamptz,
  ADD COLUMN IF NOT EXISTS cadencia_falhas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_falha text;

CREATE INDEX IF NOT EXISTS idx_linkedin_contacts_cadence
  ON public.linkedin_contacts (cadencia_status, data_prox_disparo)
  WHERE cadencia_status = 'active';

CREATE INDEX IF NOT EXISTS idx_linkedin_contacts_provider_id
  ON public.linkedin_contacts (provider_id)
  WHERE provider_id IS NOT NULL;