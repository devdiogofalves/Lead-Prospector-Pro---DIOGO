ALTER TABLE public.qualification_settings
  ADD COLUMN IF NOT EXISTS handoff_group_jid text,
  ADD COLUMN IF NOT EXISTS handoff_group_name text;

ALTER TABLE public.qualification_conversations
  ADD COLUMN IF NOT EXISTS qualified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary text;

CREATE INDEX IF NOT EXISTS idx_qual_conv_qualified ON public.qualification_conversations(user_id, qualified);