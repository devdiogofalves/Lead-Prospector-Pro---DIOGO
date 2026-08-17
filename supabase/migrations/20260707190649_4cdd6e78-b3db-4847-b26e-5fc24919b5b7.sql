ALTER TABLE public.qualification_settings
ADD COLUMN IF NOT EXISTS response_instructions TEXT;

COMMENT ON COLUMN public.qualification_settings.response_instructions IS 'Instruções operacionais extras para o agente de qualificação, como saudação inicial, áudio e regras de atendimento.';