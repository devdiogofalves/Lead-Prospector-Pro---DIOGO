ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS auto_dm_link TEXT,
  ADD COLUMN IF NOT EXISTS auto_dm_cta_label TEXT;