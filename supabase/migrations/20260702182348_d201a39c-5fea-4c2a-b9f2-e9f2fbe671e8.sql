ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS carousel_slides jsonb,
  ADD COLUMN IF NOT EXISTS carousel_fonts jsonb,
  ADD COLUMN IF NOT EXISTS carousel_template text;