
ALTER TABLE public.dispatch_queue
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS segmento text;
