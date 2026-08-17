-- Toggle global de cadência LinkedIn DM por usuário.
-- Antes a cadência era controlada APENAS por contato (cadencia_status em
-- linkedin_contacts), sem switch principal. Operador queria poder "ligar/
-- desligar" a prospecção automática inteira via UI.
--
-- Default FALSE: sistema sai do PR desligado por segurança — usuário liga
-- explicitamente após confirmar Unipile conectado e cadência configurada.
--
-- O linkedin-cadence-worker (cron 1h) deve verificar essa flag por usuário
-- antes de processar os contatos ativos dele.

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS linkedin_cadence_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_integrations.linkedin_cadence_enabled IS
  'Quando true, o linkedin-cadence-worker processa contatos ativos deste user a cada hora. Default false (operador precisa ligar via UI).';
