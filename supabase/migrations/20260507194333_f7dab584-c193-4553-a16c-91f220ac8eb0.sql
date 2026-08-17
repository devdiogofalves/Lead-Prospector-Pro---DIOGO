ALTER TABLE public.dispatch_queue
  ADD COLUMN IF NOT EXISTS site text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS especialidades text,
  ADD COLUMN IF NOT EXISTS scraped_context text;