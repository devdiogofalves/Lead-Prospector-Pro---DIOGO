
-- social_brand_assets
CREATE TABLE public.social_brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('feed_template','carousel_template','mood','ugc_avatar','logo')),
  storage_path TEXT NOT NULL,
  public_url TEXT,
  label TEXT,
  notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_brand_assets TO authenticated;
GRANT ALL ON public.social_brand_assets TO service_role;
ALTER TABLE public.social_brand_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own assets" ON public.social_brand_assets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_social_brand_assets_user_kind ON public.social_brand_assets(user_id, kind);
CREATE TRIGGER trg_social_brand_assets_updated
  BEFORE UPDATE ON public.social_brand_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- social_content_plans
CREATE TABLE public.social_content_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating','ready','published','failed')),
  theme_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_content_plans TO authenticated;
GRANT ALL ON public.social_content_plans TO service_role;
ALTER TABLE public.social_content_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plans" ON public.social_content_plans FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_social_content_plans_updated
  BEFORE UPDATE ON public.social_content_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- social_posts new columns
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.social_content_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reference_asset_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_image_url TEXT,
  ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS post_format TEXT;
