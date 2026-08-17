
-- ============ social_posts ============
CREATE TABLE public.social_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('linkedin','instagram')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','generating','publishing','published','failed')),
  media_type TEXT NOT NULL DEFAULT 'text' CHECK (media_type IN ('text','image','carousel','video','reel','story')),
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  caption TEXT,
  hashtags TEXT,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  unipile_post_id TEXT,
  unipile_account_id TEXT,
  post_url TEXT,
  likes INT NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  dms_sent INT NOT NULL DEFAULT 0,
  leads_created INT NOT NULL DEFAULT 0,
  -- Auto-engagement controls
  auto_dm_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_dm_trigger_keyword TEXT, -- NULL = qualquer comentário
  auto_dm_message TEXT, -- mensagem custom; se NULL usa IA com SPIN
  auto_comment_reply TEXT, -- resposta pública no comentário; NULL = não responde publicamente
  auto_dm_on_like BOOLEAN NOT NULL DEFAULT false,
  auto_dm_on_follow BOOLEAN NOT NULL DEFAULT false,
  -- Geração IA
  ai_prompt TEXT,
  ai_model TEXT, -- ex: gpt-image-2, veo-3, omni
  last_error TEXT,
  metrics_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_posts_user ON public.social_posts(user_id);
CREATE INDEX idx_social_posts_scheduled ON public.social_posts(status, scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_social_posts_unipile ON public.social_posts(unipile_post_id) WHERE unipile_post_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own social_posts select" ON public.social_posts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own social_posts insert" ON public.social_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own social_posts update" ON public.social_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own social_posts delete" ON public.social_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_social_posts_updated_at BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ social_post_interactions ============
CREATE TABLE public.social_post_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('comment','like','follow')),
  actor_handle TEXT,
  actor_name TEXT,
  actor_provider_id TEXT,
  actor_profile_url TEXT,
  content TEXT, -- texto do comentário
  unipile_event_id TEXT UNIQUE,
  replied BOOLEAN NOT NULL DEFAULT false,
  reply_content TEXT,
  dm_sent BOOLEAN NOT NULL DEFAULT false,
  dm_content TEXT,
  lead_created BOOLEAN NOT NULL DEFAULT false,
  lead_table TEXT,
  lead_id UUID,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_spi_post ON public.social_post_interactions(post_id);
CREATE INDEX idx_spi_user ON public.social_post_interactions(user_id);
CREATE INDEX idx_spi_actor ON public.social_post_interactions(user_id, actor_provider_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_interactions TO authenticated;
GRANT ALL ON public.social_post_interactions TO service_role;

ALTER TABLE public.social_post_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own spi select" ON public.social_post_interactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own spi insert" ON public.social_post_interactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own spi update" ON public.social_post_interactions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own spi delete" ON public.social_post_interactions FOR DELETE TO authenticated USING (auth.uid() = user_id);
