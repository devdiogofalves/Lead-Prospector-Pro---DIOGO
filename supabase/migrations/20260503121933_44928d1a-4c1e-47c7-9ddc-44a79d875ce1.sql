
-- Settings
CREATE TABLE public.qualification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  paused boolean NOT NULL DEFAULT false,
  use_audio boolean NOT NULL DEFAULT true,
  audio_ratio numeric NOT NULL DEFAULT 0.25,
  buffer_seconds integer NOT NULL DEFAULT 5,
  voice_id text,
  system_prompt text,
  webhook_path text NOT NULL DEFAULT 'qualificacao-humanizada',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.qualification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own qualification_settings" ON public.qualification_settings FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own qualification_settings" ON public.qualification_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own qualification_settings" ON public.qualification_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own qualification_settings" ON public.qualification_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Conversations
CREATE TABLE public.qualification_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  telefone text NOT NULL,
  nome text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_inbound_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, telefone)
);
ALTER TABLE public.qualification_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own qualification_conversations" ON public.qualification_conversations FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own qualification_conversations" ON public.qualification_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own qualification_conversations" ON public.qualification_conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own qualification_conversations" ON public.qualification_conversations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Messages
CREATE TABLE public.qualification_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.qualification_conversations(id) ON DELETE CASCADE,
  telefone text NOT NULL,
  role text NOT NULL,
  content text,
  audio_url text,
  transcribed boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  evolution_response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_qmsg_pending ON public.qualification_messages(user_id, conversation_id, processed, created_at) WHERE role = 'user' AND processed = false;
ALTER TABLE public.qualification_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own qualification_messages" ON public.qualification_messages FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own qualification_messages" ON public.qualification_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own qualification_messages" ON public.qualification_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own qualification_messages" ON public.qualification_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Storage bucket for qualification audio replies
INSERT INTO storage.buckets (id, name, public) VALUES ('qualificacao-audio', 'qualificacao-audio', true)
ON CONFLICT (id) DO NOTHING;

-- pg_cron job to tick worker every minute
SELECT cron.schedule(
  'qualification-worker-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dxwvivhwgnheuqvhlpsz.supabase.co/functions/v1/qualification-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
