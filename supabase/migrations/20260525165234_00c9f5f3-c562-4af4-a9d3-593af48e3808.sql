
-- Table
CREATE TABLE public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user','admin')),
  content TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  read_by_user BOOLEAN NOT NULL DEFAULT false,
  read_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_messages_user ON public.support_messages(user_id, created_at);
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own support thread"
ON public.support_messages FOR SELECT TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));

CREATE POLICY "Users send in own thread"
ON public.support_messages FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id AND sender_role = 'user' AND sender_id = auth.uid())
  OR (has_role(auth.uid(),'admin') AND sender_role = 'admin' AND sender_id = auth.uid())
);

CREATE POLICY "Users update read flags"
ON public.support_messages FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'));

CREATE POLICY "Admins delete messages"
ON public.support_messages FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('support-attachments','support-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Support attachments public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'support-attachments');

CREATE POLICY "Users upload own support attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support-attachments'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(),'admin'))
);

CREATE POLICY "Admins manage support attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'support-attachments' AND has_role(auth.uid(),'admin'));
