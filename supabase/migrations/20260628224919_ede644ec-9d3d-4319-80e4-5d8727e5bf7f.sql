CREATE TABLE public.social_reference_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  title text,
  summary text,
  features jsonb DEFAULT '[]'::jsonb,
  value_props jsonb DEFAULT '[]'::jsonb,
  cta text,
  og_image_url text,
  raw_text text,
  last_scraped_at timestamptz,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, url)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_reference_pages TO authenticated;
GRANT ALL ON public.social_reference_pages TO service_role;

ALTER TABLE public.social_reference_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own refs select" ON public.social_reference_pages FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own refs insert" ON public.social_reference_pages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own refs update" ON public.social_reference_pages FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own refs delete" ON public.social_reference_pages FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_social_reference_pages_user ON public.social_reference_pages(user_id, active);