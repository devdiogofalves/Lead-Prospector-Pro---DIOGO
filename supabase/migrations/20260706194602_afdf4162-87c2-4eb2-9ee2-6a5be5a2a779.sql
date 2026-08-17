
ALTER TABLE public.dispatch_queue
  ADD COLUMN IF NOT EXISTS followups_sent int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_stage text,
  ADD COLUMN IF NOT EXISTS last_followup_at timestamptz;

ALTER TABLE public.qualification_conversations
  ADD COLUMN IF NOT EXISTS followups_sent int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_stage text,
  ADD COLUMN IF NOT EXISTS last_followup_at timestamptz;

CREATE INDEX IF NOT EXISTS dispatch_queue_followup_idx
  ON public.dispatch_queue (user_id, status, followups_sent)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS qualification_conversations_followup_idx
  ON public.qualification_conversations (user_id, status, followups_sent, last_message_at);
