ALTER TABLE public.qualification_settings
  ADD COLUMN IF NOT EXISTS schedule_hour_start smallint NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS schedule_hour_end smallint NOT NULL DEFAULT 19,
  ADD COLUMN IF NOT EXISTS schedule_block_sunday boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS schedule_block_saturday boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_timezone text NOT NULL DEFAULT 'America/Sao_Paulo';