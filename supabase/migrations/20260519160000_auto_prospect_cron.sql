-- Fase E #1: pg_cron pra auto-prospect rodar AUTOMATICAMENTE
--
-- Antes desta migration, a UI da "Prospecção Automatizada" mostrava toggle
-- "ATIVA" + texto "cron roda a cada hora" mas NÃO existia pg_cron job
-- agendado para auto-prospect. O endpoint /auto-prospect só era invocado
-- via clique manual em "Executar agora" — o toggle era decorativo.
--
-- Esta migration agenda o auto-prospect 1x/hora. O próprio endpoint já tem
-- a lógica de filtrar `enabled=true AND next_run_at <= now()`, e cada
-- runForUser() atualiza next_run_at conforme frequency_hours do usuário.
-- Assim 1 cron job único serve N usuários com frequências diferentes.

SELECT cron.schedule(
  'auto-prospect',
  '0 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/auto-prospect',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  ) AS request_id;$$
);
