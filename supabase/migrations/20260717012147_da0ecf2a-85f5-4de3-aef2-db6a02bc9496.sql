ALTER TABLE public.qualification_settings
  ADD COLUMN IF NOT EXISTS opening_delay_seconds INTEGER NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.qualification_settings.opening_delay_seconds IS
  'Delay adicional (segundos) aplicado APENAS na primeira resposta da IA numa conversa nova — humaniza a abertura estilo NK 360. Clamp 0..180.';