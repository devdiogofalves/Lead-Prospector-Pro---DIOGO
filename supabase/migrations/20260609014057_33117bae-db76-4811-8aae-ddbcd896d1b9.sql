
ALTER TABLE public.instagram_contacts
  ADD COLUMN IF NOT EXISTS dm_disparo TEXT NOT NULL DEFAULT 'Não',
  ADD COLUMN IF NOT EXISTS dm_data_disparo TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.telegram_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  identifier TEXT NOT NULL,
  display_name TEXT,
  last_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  provider_chat_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, identifier)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_recipients TO authenticated;
GRANT ALL ON public.telegram_recipients TO service_role;
ALTER TABLE public.telegram_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg recip select own" ON public.telegram_recipients
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tg recip insert own" ON public.telegram_recipients
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tg recip update own" ON public.telegram_recipients
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "tg recip delete own" ON public.telegram_recipients
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
