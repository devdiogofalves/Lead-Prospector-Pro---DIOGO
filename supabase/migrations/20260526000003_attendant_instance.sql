-- Chip atendente dedicado (Fase 2).
-- Quando `attendant_instance_id` está preenchido em qualification_settings,
-- o qualification-worker usa ESSE chip para todas as respostas da conversa,
-- independente do chip que fez o disparo inicial.
-- Caso seja NULL (padrão), mantém comportamento anterior: usa o chip que disparou.

ALTER TABLE public.qualification_settings
  ADD COLUMN IF NOT EXISTS attendant_instance_id uuid
    REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.qualification_settings.attendant_instance_id IS
  'Chip dedicado para responder qualificações. NULL = usa chip que iniciou a conversa (padrão).';
