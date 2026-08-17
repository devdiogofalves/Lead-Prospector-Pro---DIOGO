ALTER TABLE public.qualification_conversations
  ADD COLUMN IF NOT EXISTS nome_contato text,
  ADD COLUMN IF NOT EXISTS cargo text;