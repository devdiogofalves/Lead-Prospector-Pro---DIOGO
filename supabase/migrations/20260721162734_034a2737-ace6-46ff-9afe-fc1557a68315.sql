UPDATE public.qualification_settings
SET reengagement_enabled = true,
    reengagement_delay_hours = COALESCE(reengagement_delay_hours, 24),
    reengagement_max_attempts = COALESCE(reengagement_max_attempts, 2),
    reengagement_template = COALESCE(NULLIF(reengagement_template,''), 'Oi! Só passando aqui pra retomar nossa conversa — quer que eu te chame em outro horário melhor pra você?')
WHERE reengagement_enabled IS DISTINCT FROM true;

ALTER TABLE public.qualification_settings
  ALTER COLUMN reengagement_enabled SET DEFAULT true;