CREATE OR REPLACE FUNCTION public.get_ai_key_for_user(_user_id uuid, _provider text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
  v_admin uuid;
  v_caller uuid := auth.uid();
BEGIN
  IF _user_id IS NULL OR _provider IS NULL THEN
    RETURN NULL;
  END IF;

  -- Se veio como usuário autenticado (JWT), impede IDOR: só pode consultar as próprias chaves.
  -- Chamadas via service_role (workers/edge functions) têm auth.uid() = NULL e continuam funcionando.
  IF v_caller IS NOT NULL AND v_caller <> _user_id THEN
    RETURN NULL;
  END IF;

  SELECT api_key INTO v_key
    FROM public.user_api_keys
   WHERE user_id = _user_id AND provider = _provider
   LIMIT 1;
  IF v_key IS NOT NULL AND length(v_key) > 0 THEN
    RETURN v_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_shared_apis
     WHERE client_id = _user_id AND provider = _provider AND enabled = true
  ) THEN
    SELECT ur.user_id INTO v_admin FROM public.user_roles ur WHERE ur.role = 'admin' LIMIT 1;
    IF v_admin IS NOT NULL THEN
      SELECT api_key INTO v_key
        FROM public.user_api_keys
       WHERE user_id = v_admin AND provider = _provider
       LIMIT 1;
      RETURN v_key;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;