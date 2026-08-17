ALTER TABLE public.social_auto_engage_rules
  ALTER COLUMN followup_use_ai SET DEFAULT false;

UPDATE public.social_auto_engage_rules
SET followup_use_ai = false
WHERE followup_use_ai IS NULL;

CREATE OR REPLACE FUNCTION public.normalize_social_auto_engage_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.followup_use_ai := COALESCE(NEW.followup_use_ai, false);
  NEW.require_follower := COALESCE(NEW.require_follower, false);
  NEW.move_to_dm_on_interest := COALESCE(NEW.move_to_dm_on_interest, true);
  NEW.use_ai := COALESCE(NEW.use_ai, true);
  NEW.reply_public := COALESCE(NEW.reply_public, true);
  NEW.send_dm := COALESCE(NEW.send_dm, true);
  NEW.capture_lead := COALESCE(NEW.capture_lead, true);
  NEW.active := COALESCE(NEW.active, true);
  NEW.priority := COALESCE(NEW.priority, 100);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_social_auto_engage_rules_before_write ON public.social_auto_engage_rules;
CREATE TRIGGER normalize_social_auto_engage_rules_before_write
BEFORE INSERT OR UPDATE ON public.social_auto_engage_rules
FOR EACH ROW
EXECUTE FUNCTION public.normalize_social_auto_engage_rules();