
ALTER TABLE public.instagram_contacts
  ADD COLUMN IF NOT EXISTS extraction_source TEXT,
  ADD COLUMN IF NOT EXISTS extraction_target TEXT;

CREATE INDEX IF NOT EXISTS instagram_contacts_extraction_idx
  ON public.instagram_contacts(user_id, extraction_source, extraction_target);

CREATE INDEX IF NOT EXISTS whatsapp_group_leads_user_group_idx
  ON public.whatsapp_group_leads(user_id, group_jid);
