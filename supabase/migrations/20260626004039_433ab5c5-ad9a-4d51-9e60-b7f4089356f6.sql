
-- Marca como processadas todas as msgs pendentes das conversas Telegram criadas a partir de grupos/canais
UPDATE public.qualification_messages
SET processed = true
WHERE processed = false
  AND conversation_id IN (
    SELECT id FROM public.qualification_conversations
    WHERE user_id = 'cef22c4a-7c74-4892-b2f6-4047e02cfeda'
      AND channel = 'telegram'
      AND created_at > '2026-06-25'
  );

-- Encerra essas conversas para não voltarem ao radar
UPDATE public.qualification_conversations
SET status = 'closed'
WHERE user_id = 'cef22c4a-7c74-4892-b2f6-4047e02cfeda'
  AND channel = 'telegram'
  AND created_at > '2026-06-25';
