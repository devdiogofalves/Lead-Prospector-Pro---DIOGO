-- Add unique constraint on username column for instagram_contacts
ALTER TABLE public.instagram_contacts ADD CONSTRAINT instagram_contacts_username_unique UNIQUE (username);