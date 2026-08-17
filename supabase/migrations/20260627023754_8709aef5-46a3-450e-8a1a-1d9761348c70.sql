
ALTER TABLE public.dispatch_queue
  ADD COLUMN IF NOT EXISTS recipient_handle TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS chat_id TEXT,
  ADD COLUMN IF NOT EXISTS unipile_chat_id TEXT;

CREATE INDEX IF NOT EXISTS idx_dispatch_queue_channel_status
  ON public.dispatch_queue (channel, status, scheduled_at);

CREATE TABLE IF NOT EXISTS public.whatsapp_group_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_jid TEXT NOT NULL,
  group_name TEXT,
  member_jid TEXT NOT NULL,
  phone TEXT,
  pushname TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disparo TEXT DEFAULT 'Não',
  data_disparo TIMESTAMPTZ,
  mensagem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_jid, member_jid)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_group_leads TO authenticated;
GRANT ALL ON public.whatsapp_group_leads TO service_role;
ALTER TABLE public.whatsapp_group_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_wa_group_leads" ON public.whatsapp_group_leads
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_wa_group_leads_user ON public.whatsapp_group_leads (user_id, scraped_at DESC);

CREATE TABLE IF NOT EXISTS public.instagram_hashtag_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hashtag TEXT NOT NULL,
  username TEXT NOT NULL,
  full_name TEXT,
  bio TEXT,
  followers INTEGER,
  post_url TEXT,
  post_caption TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disparo TEXT DEFAULT 'Não',
  data_disparo TIMESTAMPTZ,
  mensagem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, hashtag, username)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_hashtag_leads TO authenticated;
GRANT ALL ON public.instagram_hashtag_leads TO service_role;
ALTER TABLE public.instagram_hashtag_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_ig_hashtag_leads" ON public.instagram_hashtag_leads
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_ig_hashtag_leads_user ON public.instagram_hashtag_leads (user_id, scraped_at DESC);
