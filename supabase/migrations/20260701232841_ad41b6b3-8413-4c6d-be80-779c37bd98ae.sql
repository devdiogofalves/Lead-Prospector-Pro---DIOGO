UPDATE public.qualification_messages
SET processed = true, error = 'stale_backfill_cleanup'
WHERE role = 'user' AND processed = false
  AND created_at < now() - interval '24 hours';