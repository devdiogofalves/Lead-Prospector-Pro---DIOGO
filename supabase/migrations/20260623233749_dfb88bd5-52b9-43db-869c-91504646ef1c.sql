
ALTER TABLE public.qualification_conversations 
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS unipile_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS unipile_account_id TEXT,
  ADD COLUMN IF NOT EXISTS unipile_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS unipile_subject TEXT,
  ADD COLUMN IF NOT EXISTS unipile_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS fase_spin TEXT,
  ALTER COLUMN telefone DROP NOT NULL;

ALTER TABLE public.qualification_messages
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp',
  ALTER COLUMN telefone DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS qualification_conversations_unipile_chat_uq 
  ON public.qualification_conversations(user_id, unipile_chat_id) 
  WHERE unipile_chat_id IS NOT NULL;
