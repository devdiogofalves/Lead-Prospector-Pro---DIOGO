-- Remove conversa duplicada @lid
DELETE FROM public.qualification_messages WHERE telefone = '95460043821172';
DELETE FROM public.qualification_conversations WHERE telefone = '95460043821172';

-- Limpa mensagens duplicadas existentes (mantém a mais antiga por user_id+message_id)
DELETE FROM public.qualification_messages a
USING public.qualification_messages b
WHERE a.message_id IS NOT NULL
  AND a.user_id = b.user_id
  AND a.message_id = b.message_id
  AND a.created_at > b.created_at;

-- Índice único parcial para dedupe
CREATE UNIQUE INDEX IF NOT EXISTS qualification_messages_user_msgid_uniq
  ON public.qualification_messages (user_id, message_id)
  WHERE message_id IS NOT NULL;

-- Realtime
ALTER TABLE public.qualification_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.qualification_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='qualification_conversations') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.qualification_conversations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='qualification_messages') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.qualification_messages';
  END IF;
END $$;