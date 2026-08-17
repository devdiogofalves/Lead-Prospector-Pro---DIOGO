-- Meta/Instagram final fixes: comments, DMs, stories, token revalidation and workers.

-- Auto-engage UI creates thank_like/welcome_follow modes; the original CHECK
-- allowed only global/per_post/keyword and caused insert failures.
ALTER TABLE public.social_auto_engage_rules
  DROP CONSTRAINT IF EXISTS social_auto_engage_rules_mode_check;

ALTER TABLE public.social_auto_engage_rules
  ADD CONSTRAINT social_auto_engage_rules_mode_check
  CHECK (mode IN ('global','per_post','keyword','thank_like','welcome_follow'));

-- Organic DMs/story replies are not always tied to an internal scheduled post.
ALTER TABLE public.social_post_interactions
  ALTER COLUMN post_id DROP NOT NULL;

-- Cron jobs must call the current Supabase project directly; do not depend on
-- current_setting('app.supabase_url'), which is NULL in production.
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN SELECT jobname FROM cron.job
           WHERE jobname IN (
             'meta-instagram-token-refresh-daily',
             'social-schedule-worker-tick',
             'social-followup-worker-tick'
           )
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

-- Revalidate Page Tokens + renew subscribed_apps daily.
SELECT cron.schedule(
  'meta-instagram-token-refresh-daily',
  '17 6 * * *',
  $$SELECT net.http_post(
    url := 'https://tzrqcmkdkljxjkrekbyx.supabase.co/functions/v1/meta-instagram-token-refresh?force=true',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{"force":true}'::jsonb
  ) AS request_id;$$
);

-- Publish scheduled posts/stories/reels/carousels every minute.
SELECT cron.schedule(
  'social-schedule-worker-tick',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://tzrqcmkdkljxjkrekbyx.supabase.co/functions/v1/social-schedule-worker',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) AS request_id;$$
);

-- Send delayed social follow-ups every five minutes.
SELECT cron.schedule(
  'social-followup-worker-tick',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://tzrqcmkdkljxjkrekbyx.supabase.co/functions/v1/social-followup-worker',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) AS request_id;$$
);
