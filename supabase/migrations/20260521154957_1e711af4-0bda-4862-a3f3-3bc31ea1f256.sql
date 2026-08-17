ALTER TABLE public.dispatch_queue
  ADD COLUMN IF NOT EXISTS nome_contato text,
  ADD COLUMN IF NOT EXISTS cargo text;