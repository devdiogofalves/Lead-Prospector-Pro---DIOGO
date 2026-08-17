
ALTER TABLE public.prospecting_profiles
  ADD COLUMN IF NOT EXISTS site_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS gmb_url text,
  ADD COLUMN IF NOT EXISTS scraped_data jsonb,
  ADD COLUMN IF NOT EXISTS agent_system_prompt text,
  ADD COLUMN IF NOT EXISTS mental_triggers jsonb;
