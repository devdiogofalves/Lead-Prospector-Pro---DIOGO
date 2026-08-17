-- Fix IA learning/response automation jobs.
-- Older migrations left worker ticks pointing to the old Lovable project
-- (dxwvivhwgnheuqvhlpsz), so inbound WhatsApp messages and dispatch queues
-- could stay pending forever.
-- Also add the missing daily `mavi-learn` job that the UI describes as automatic.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-worker-tick');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'dispatch-worker-tick was not scheduled or could not be unscheduled: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('qualification-worker-tick');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'qualification-worker-tick was not scheduled or could not be unscheduled: %', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('mavi-learn-daily');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'mavi-learn-daily was not scheduled or could not be unscheduled: %', SQLERRM;
END $$;

SELECT cron.schedule(
  'dispatch-worker-tick',
  '* * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/dispatch-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);

SELECT cron.schedule(
  'qualification-worker-tick',
  '* * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/qualification-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);

SELECT cron.schedule(
  'mavi-learn-daily',
  '0 6 * * *', -- 03:00 BRT
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/mavi-learn',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);
