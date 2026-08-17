ALTER TABLE public.qualification_conversations
  ADD COLUMN IF NOT EXISTS context_pack text,
  ADD COLUMN IF NOT EXISTS reengagements_sent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reengagement_at timestamptz;

ALTER TABLE public.qualification_settings
  ADD COLUMN IF NOT EXISTS reengagement_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reengagement_delay_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS reengagement_max_attempts integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS reengagement_template text;