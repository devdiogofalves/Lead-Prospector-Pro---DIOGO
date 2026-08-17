ALTER TABLE public.social_auto_engage_rules
  ALTER COLUMN followup_use_ai SET DEFAULT false,
  ALTER COLUMN followup_use_ai DROP NOT NULL,
  ALTER COLUMN require_follower SET DEFAULT false;

UPDATE public.social_auto_engage_rules SET followup_use_ai = false WHERE followup_use_ai IS NULL;
ALTER TABLE public.social_auto_engage_rules ALTER COLUMN followup_use_ai SET NOT NULL;