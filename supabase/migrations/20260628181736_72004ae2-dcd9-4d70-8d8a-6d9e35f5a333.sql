ALTER TABLE public.social_brand_profile
  ADD COLUMN IF NOT EXISTS followers_count INTEGER,
  ADD COLUMN IF NOT EXISTS following_count INTEGER,
  ADD COLUMN IF NOT EXISTS posts_count INTEGER,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_business BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS avg_likes NUMERIC,
  ADD COLUMN IF NOT EXISTS avg_comments NUMERIC,
  ADD COLUMN IF NOT EXISTS engagement_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS bio_link_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_brand_profile_slug
  ON public.social_brand_profile (LOWER(bio_link_slug))
  WHERE bio_link_slug IS NOT NULL;