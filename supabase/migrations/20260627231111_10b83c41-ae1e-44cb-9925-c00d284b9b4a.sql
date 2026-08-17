
CREATE TABLE IF NOT EXISTS public.meta_instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ig_user_id TEXT NOT NULL,
  username TEXT,
  access_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'long_lived',
  expires_at TIMESTAMPTZ,
  scopes TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refreshed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(ig_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_instagram_accounts TO authenticated;
GRANT ALL ON public.meta_instagram_accounts TO service_role;

ALTER TABLE public.meta_instagram_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meta IG account"
  ON public.meta_instagram_accounts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_meta_instagram_accounts_updated_at
  BEFORE UPDATE ON public.meta_instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_meta_ig_accounts_user ON public.meta_instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_ig_accounts_ig_user ON public.meta_instagram_accounts(ig_user_id);
