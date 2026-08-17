
-- Cria os jobs pg_cron para os workers MAVI
-- dispatch-worker: processa a fila de disparo a cada 1 minuto
-- qualification-worker: processa mensagens recebidas a cada 1 minuto

SELECT cron.schedule(
  'dispatch-worker',
  '* * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/dispatch-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  ) AS request_id;$$
);

SELECT cron.schedule(
  'qualification-worker',
  '* * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/qualification-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  ) AS request_id;$$
);
