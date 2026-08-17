SELECT cron.schedule(
  'dispatch-worker-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dxwvivhwgnheuqvhlpsz.supabase.co/functions/v1/dispatch-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);