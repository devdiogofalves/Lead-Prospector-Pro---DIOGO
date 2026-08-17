ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS reel_captions jsonb,
  ADD COLUMN IF NOT EXISTS reel_caption_style jsonb,
  ADD COLUMN IF NOT EXISTS reel_source_url text,
  ADD COLUMN IF NOT EXISTS reel_rendered_url text;