ALTER TABLE public.qualification_messages
ADD COLUMN IF NOT EXISTS message_id text;

CREATE INDEX IF NOT EXISTS idx_qualification_messages_message_id
ON public.qualification_messages (user_id, telefone, message_id)
WHERE message_id IS NOT NULL;