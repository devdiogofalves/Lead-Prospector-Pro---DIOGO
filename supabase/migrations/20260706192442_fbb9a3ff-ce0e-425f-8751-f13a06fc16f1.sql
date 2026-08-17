
-- 1. Remove constraint global que permitia roubo de linhas entre tenants
ALTER TABLE public.empresas_enriquecidas DROP CONSTRAINT IF EXISTS unique_cnpj;

-- 2. Trava escritas em client_subscriptions
DROP POLICY IF EXISTS "Resellers manage their clients" ON public.client_subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.client_subscriptions FROM authenticated;
-- Mantém SELECT (a policy "Users view own subscription" continua permitindo user_id/reseller_id/admin lerem)
-- Toda escrita agora é feita por edge functions com service_role (kiwify-webhook, admin-manage-client, reseller-create-client)

-- 3. Corrige RPC de Apify shared — ignora argumento e usa auth.uid()
CREATE OR REPLACE FUNCTION public.get_apify_key_for_user(_user uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_admin uuid;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN NULL;
  END IF;
  -- SEGURANÇA: sempre usa o usuário logado, nunca o argumento — previne IDOR
  SELECT api_key INTO v_key
    FROM public.user_api_keys
   WHERE user_id = v_caller AND provider = 'apify'
   LIMIT 1;
  IF v_key IS NOT NULL AND length(v_key) > 0 THEN
    RETURN v_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_shared_apis
     WHERE client_id = v_caller AND provider = 'apify' AND enabled = true
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
