
ALTER TABLE public.qualification_settings
  ADD COLUMN IF NOT EXISTS schedule_block_monday    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_block_tuesday   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_block_wednesday boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_block_thursday  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_block_friday    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_slot_minutes    integer NOT NULL DEFAULT 30;
