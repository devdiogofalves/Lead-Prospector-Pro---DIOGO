CREATE TABLE public.social_auto_engage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('instagram','linkedin','facebook')),
  mode text NOT NULL DEFAULT 'global' CHECK (mode IN ('global','per_post','keyword')),
  post_id text,
  keyword text,
  use_ai boolean NOT NULL DEFAULT true,
  public_reply_template text DEFAULT 'Oi @{name}! Te mandei no direct 💌',
  dm_template text NOT NULL DEFAULT 'Oi {name}! Vi seu comentário e separei isso pra você 👇',
  cta_link text,
  cta_label text DEFAULT 'Quero saber mais',
  reply_public boolean NOT NULL DEFAULT true,
  send_dm boolean NOT NULL DEFAULT true,
  capture_lead boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  hits_count int NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_auto_engage_rules TO authenticated;
GRANT ALL ON public.social_auto_engage_rules TO service_role;

ALTER TABLE public.social_auto_engage_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own auto engage rules"
  ON public.social_auto_engage_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_auto_engage_lookup
  ON public.social_auto_engage_rules (user_id, channel, active, priority);

CREATE TRIGGER trg_auto_engage_updated_at
  BEFORE UPDATE ON public.social_auto_engage_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();