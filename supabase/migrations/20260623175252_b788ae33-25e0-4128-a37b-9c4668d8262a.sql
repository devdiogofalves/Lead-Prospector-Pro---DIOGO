
-- Reschedule background workers with hardcoded URL.
-- The previous schedules referenced current_setting('app.supabase_url') which returns NULL
-- on this database, so net.http_post received url := NULL and never reached the edge functions.
-- Result: dispatch-worker, qualification-worker and linkedin-cadence-worker were silently dead.

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT jobname FROM cron.job
           WHERE jobname IN (
             'dispatch-worker-tick',
             'qualification-worker-tick',
             'linkedin-cadence-worker',
             'mavi-learn-daily',
             'auto-prospect-tick'
           )
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

-- Anon key é público (já vai no frontend). As edge functions usam Deno.env internamente
-- pra montar admin client com service_role, então não dependem do Bearer enviado.
SELECT cron.schedule(
  'dispatch-worker-tick',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://owxcdevylkljaiilevav.supabase.co/functions/v1/dispatch-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93eGNkZXZ5bGtsamFpaWxldmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTY3NTgsImV4cCI6MjA5NTA5Mjc1OH0.LT22_BP-5ujV8bir3oTIXzCODpORAZy1w75-L2cL4rY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);

SELECT cron.schedule(
  'qualification-worker-tick',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://owxcdevylkljaiilevav.supabase.co/functions/v1/qualification-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93eGNkZXZ5bGtsamFpaWxldmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTY3NTgsImV4cCI6MjA5NTA5Mjc1OH0.LT22_BP-5ujV8bir3oTIXzCODpORAZy1w75-L2cL4rY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);

SELECT cron.schedule(
  'linkedin-cadence-worker',
  '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://owxcdevylkljaiilevav.supabase.co/functions/v1/linkedin-cadence-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93eGNkZXZ5bGtsamFpaWxldmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTY3NTgsImV4cCI6MjA5NTA5Mjc1OH0.LT22_BP-5ujV8bir3oTIXzCODpORAZy1w75-L2cL4rY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);

SELECT cron.schedule(
  'mavi-learn-daily',
  '0 6 * * *',
  $$SELECT net.http_post(
    url := 'https://owxcdevylkljaiilevav.supabase.co/functions/v1/mavi-learn',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93eGNkZXZ5bGtsamFpaWxldmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTY3NTgsImV4cCI6MjA5NTA5Mjc1OH0.LT22_BP-5ujV8bir3oTIXzCODpORAZy1w75-L2cL4rY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);

SELECT cron.schedule(
  'auto-prospect-tick',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := 'https://owxcdevylkljaiilevav.supabase.co/functions/v1/auto-prospect',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93eGNkZXZ5bGtsamFpaWxldmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTY3NTgsImV4cCI6MjA5NTA5Mjc1OH0.LT22_BP-5ujV8bir3oTIXzCODpORAZy1w75-L2cL4rY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);
