ALTER TABLE public.social_post_interactions
  ALTER COLUMN post_id DROP NOT NULL;

ALTER TABLE public.instagram_contacts
  ADD COLUMN IF NOT EXISTS provider_id text;

CREATE INDEX IF NOT EXISTS idx_instagram_contacts_user_provider
  ON public.instagram_contacts (user_id, provider_id)
  WHERE provider_id IS NOT NULL;