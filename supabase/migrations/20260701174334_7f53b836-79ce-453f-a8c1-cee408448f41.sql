ALTER TABLE public.instagram_contacts
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_business boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_pic_url text;

CREATE UNIQUE INDEX IF NOT EXISTS instagram_contacts_user_username_uidx
  ON public.instagram_contacts (user_id, username)
  WHERE username IS NOT NULL;