ALTER TABLE public.qualification_settings
  ADD COLUMN IF NOT EXISTS fixed_video_url text,
  ADD COLUMN IF NOT EXISTS fixed_video_caption text;