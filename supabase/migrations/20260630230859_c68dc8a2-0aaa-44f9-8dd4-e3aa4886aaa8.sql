
CREATE OR REPLACE FUNCTION public.get_apify_key_for_user(_user uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_admin uuid;
BEGIN
  SELECT api_key INTO v_key
    FROM public.user_api_keys
   WHERE user_id = _user AND provider = 'apify'
   LIMIT 1;
  IF v_key IS NOT NULL AND length(v_key) > 0 THEN
    RETURN v_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_shared_apis
     WHERE client_id = _user AND provider = 'apify' AND enabled = true
  ) THEN
    SELECT ur.user_id INTO v_admin
      FROM public.user_roles ur
     WHERE ur.role = 'admin'
     LIMIT 1;
    IF v_admin IS NOT NULL THEN
      SELECT api_key INTO v_key
        FROM public.user_api_keys
       WHERE user_id = v_admin AND provider = 'apify'
       LIMIT 1;
      RETURN v_key;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_apify_key_for_user(uuid) TO authenticated, service_role;
