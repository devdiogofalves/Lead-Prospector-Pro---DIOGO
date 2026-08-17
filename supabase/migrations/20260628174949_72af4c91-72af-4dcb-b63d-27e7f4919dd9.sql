
-- Brand Profile (singleton per user) — destila padrão visual do Instagram
CREATE TABLE public.social_brand_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  instagram_handle TEXT,
  display_name TEXT,
  logo_url TEXT,
  avatar_urls JSONB DEFAULT '[]'::jsonb,
  bio TEXT,
  links JSONB DEFAULT '[]'::jsonb,
  color_palette JSONB DEFAULT '{}'::jsonb,
  font_style TEXT,
  visual_mood TEXT,
  photography_style TEXT,
  layout_pattern TEXT,
  voice_tone TEXT,
  cta_style TEXT,
  niche TEXT,
  raw_analysis JSONB,
  sample_post_urls JSONB DEFAULT '[]'::jsonb,
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_brand_profile TO authenticated;
GRANT ALL ON public.social_brand_profile TO service_role;
ALTER TABLE public.social_brand_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brand profile" ON public.social_brand_profile FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_brand_profile_updated BEFORE UPDATE ON public.social_brand_profile FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Produtos (várias soluções por usuário)
CREATE TABLE public.social_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  link TEXT,
  target_audience TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  pains JSONB DEFAULT '[]'::jsonb,
  voice_tone TEXT,
  docs JSONB DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_products TO authenticated;
GRANT ALL ON public.social_products TO service_role;
ALTER TABLE public.social_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own social_products" ON public.social_products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_social_products_updated BEFORE UPDATE ON public.social_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_social_products_user ON public.social_products(user_id, active);

-- Liga produto a posts e planos
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.social_products(id) ON DELETE SET NULL;
ALTER TABLE public.social_content_plans ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.social_products(id) ON DELETE SET NULL;

-- Policies de storage para social-assets/products e avatars (bucket já existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='own social-assets read') THEN
    CREATE POLICY "own social-assets read" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'social-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='own social-assets write') THEN
    CREATE POLICY "own social-assets write" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'social-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='own social-assets update') THEN
    CREATE POLICY "own social-assets update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'social-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='own social-assets delete') THEN
    CREATE POLICY "own social-assets delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'social-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
