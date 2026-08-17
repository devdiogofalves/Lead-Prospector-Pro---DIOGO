-- Align the auto-reply contract and scheduled jobs with the LeadsBooster project.

ALTER TABLE public.social_auto_engage_rules
  DROP CONSTRAINT IF EXISTS social_auto_engage_rules_mode_check;

ALTER TABLE public.social_auto_engage_rules
  ADD CONSTRAINT social_auto_engage_rules_mode_check
  CHECK (mode IN ('global','per_post','keyword','dm','story_reply','thank_like','welcome_follow'));

DO $$
DECLARE
  job_name text;
BEGIN
  FOREACH job_name IN ARRAY ARRAY[
    'meta-instagram-token-refresh-daily',
    'social-schedule-worker-tick',
    'social-followup-worker-tick'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_name) THEN
      PERFORM cron.unschedule(job_name);
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule(
  'meta-instagram-token-refresh-daily',
  '17 6 * * *',
  $$SELECT net.http_post(
    url := 'https://owxcdevylkljaiilevav.supabase.co/functions/v1/meta-instagram-token-refresh?force=true',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{"force":true}'::jsonb
  ) AS request_id;$$
);

SELECT cron.schedule(
  'social-schedule-worker-tick',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://owxcdevylkljaiilevav.supabase.co/functions/v1/social-schedule-worker',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) AS request_id;$$
);

SELECT cron.schedule(
  'social-followup-worker-tick',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://owxcdevylkljaiilevav.supabase.co/functions/v1/social-followup-worker',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) AS request_id;$$
);
