-- Allow process-email-queue to persist explicit rate-limit audit rows.
-- The worker sets status='rate_limited' when Lovable Email returns 429, but
-- the original CHECK constraint did not include that status.
ALTER TABLE public.email_send_log
  DROP CONSTRAINT IF EXISTS email_send_log_status_check;

ALTER TABLE public.email_send_log
  ADD CONSTRAINT email_send_log_status_check
  CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq', 'rate_limited'));
