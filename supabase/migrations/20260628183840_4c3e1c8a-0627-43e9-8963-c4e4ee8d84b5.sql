
-- Add insights jsonb on brand profile and ensure unique slug
ALTER TABLE public.social_brand_profile ADD COLUMN IF NOT EXISTS insights JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.social_brand_profile ADD COLUMN IF NOT EXISTS insights_updated_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_slug_unique ON public.social_brand_profile(bio_link_slug) WHERE bio_link_slug IS NOT NULL;

-- Loosen any potential NOT NULL on expires_at for meta_instagram_accounts (page_token = vitalício)
ALTER TABLE public.meta_instagram_accounts ALTER COLUMN expires_at DROP NOT NULL;
