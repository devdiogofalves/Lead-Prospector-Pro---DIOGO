ALTER TABLE public.instagram_contacts
  DROP CONSTRAINT IF EXISTS instagram_contacts_username_unique;

DROP INDEX IF EXISTS public.instagram_contacts_username_unique;

CREATE UNIQUE INDEX IF NOT EXISTS instagram_contacts_user_username_uidx
  ON public.instagram_contacts (user_id, username)
  WHERE username IS NOT NULL;