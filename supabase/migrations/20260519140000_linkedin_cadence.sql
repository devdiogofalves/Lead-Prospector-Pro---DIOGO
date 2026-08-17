-- Fase B: Cadência automática de LinkedIn DM (D+0 → D+7 → D+14 → D+21)
-- A nota de conexão continua MANUAL (operador envia via Unipile direto).
-- A cadência inicia em 'primeira' quando o operador marca o lead como conectado
-- e clica "Iniciar cadência". O linkedin-cadence-worker (pg_cron 1x/hora) agenda
-- e dispara cada etapa subsequente.

ALTER TABLE public.linkedin_contacts
  ADD COLUMN IF NOT EXISTS cadencia_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS etapa_atual text,
  ADD COLUMN IF NOT EXISTS data_prox_disparo timestamptz,
  ADD COLUMN IF NOT EXISTS cadencia_iniciada_em timestamptz,
  ADD COLUMN IF NOT EXISTS cadencia_last_error text,
  ADD COLUMN IF NOT EXISTS cadencia_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mensagens_enviadas jsonb NOT NULL DEFAULT '[]'::jsonb;

-- cadencia_status: none/active/paused/completed/replied/failed
-- etapa_atual: primeira/followup1/followup2/encerramento (após enviar fica registrado em mensagens_enviadas)
-- data_prox_disparo: quando o cadence-worker deve disparar a etapa_atual
-- mensagens_enviadas: log [{etapa, sent_at, message_preview, status, unipile_response}]

COMMENT ON COLUMN public.linkedin_contacts.cadencia_status IS
  'Estado da cadência LinkedIn: none/active/paused/completed/replied/failed. Worker só dispara se active.';
COMMENT ON COLUMN public.linkedin_contacts.etapa_atual IS
  'Próxima etapa SPIN a disparar: primeira/followup1/followup2/encerramento.';
COMMENT ON COLUMN public.linkedin_contacts.data_prox_disparo IS
  'Quando o linkedin-cadence-worker deve processar este contato.';

-- Index otimizado para o worker varrer só contatos elegíveis (parcial — economiza espaço)
CREATE INDEX IF NOT EXISTS idx_linkedin_contacts_cadence_due
  ON public.linkedin_contacts (data_prox_disparo)
  WHERE cadencia_status = 'active';

-- pg_cron: linkedin-cadence-worker roda a cada hora (não a cada minuto — DMs LinkedIn
-- são raros, ~5-20/dia, e excesso de frequência aumenta risco de pattern de spam)
SELECT cron.schedule(
  'linkedin-cadence-worker',
  '0 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/linkedin-cadence-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  ) AS request_id;$$
);
