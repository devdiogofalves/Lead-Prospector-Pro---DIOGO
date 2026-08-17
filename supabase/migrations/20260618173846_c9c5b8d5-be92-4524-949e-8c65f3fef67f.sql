
CREATE TABLE IF NOT EXISTS public.admin_unipile_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_number     INTEGER NOT NULL UNIQUE,
  label           TEXT NOT NULL DEFAULT 'Conta Unipile',
  api_key         TEXT NOT NULL,
  dsn             TEXT NOT NULL,
  max_profiles    INTEGER NOT NULL DEFAULT 10,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_unipile_accounts TO authenticated;
GRANT ALL    ON public.admin_unipile_accounts TO service_role;
ALTER TABLE public.admin_unipile_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_unipile_accounts_admin_read"
  ON public.admin_unipile_accounts FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'nucleodameta@gmail.com'
    OR ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = TRUE)
  );
CREATE TRIGGER admin_unipile_accounts_set_updated_at
  BEFORE UPDATE ON public.admin_unipile_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.admin_shared_apis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL,
  provider            TEXT NOT NULL,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  unipile_account_id  UUID REFERENCES public.admin_unipile_accounts(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_admin_shared_apis_client  ON public.admin_shared_apis(client_id);
CREATE INDEX IF NOT EXISTS idx_admin_shared_apis_unipile ON public.admin_shared_apis(unipile_account_id);
GRANT SELECT ON public.admin_shared_apis TO authenticated;
GRANT ALL    ON public.admin_shared_apis TO service_role;
ALTER TABLE public.admin_shared_apis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_shared_apis_read"
  ON public.admin_shared_apis FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'nucleodameta@gmail.com'
    OR ((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = TRUE)
    OR client_id = auth.uid()
  );
CREATE TRIGGER admin_shared_apis_set_updated_at
  BEFORE UPDATE ON public.admin_shared_apis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill
DO $$
DECLARE
  v_admin_id  UUID := 'f3ac8214-9141-4521-afcb-0a4e50d67cc3';
  v_api_key   TEXT;
  v_dsn       TEXT;
  v_slot_id   UUID;
BEGIN
  SELECT api_key, COALESCE(extra->>'dsn', '')
    INTO v_api_key, v_dsn
  FROM public.user_api_keys
  WHERE user_id = v_admin_id AND provider = 'unipile'
  LIMIT 1;

  IF v_api_key IS NOT NULL AND v_api_key <> '' THEN
    INSERT INTO public.admin_unipile_accounts (slot_number, label, api_key, dsn)
    VALUES (1, 'Conta principal', v_api_key, v_dsn)
    ON CONFLICT (slot_number) DO UPDATE
      SET api_key = EXCLUDED.api_key, dsn = EXCLUDED.dsn
    RETURNING id INTO v_slot_id;
  END IF;

  INSERT INTO public.admin_shared_apis (client_id, provider, enabled, unipile_account_id)
  SELECT DISTINCT
    cs.user_id,
    ak.provider,
    TRUE,
    CASE WHEN ak.provider = 'unipile' THEN v_slot_id ELSE NULL END
  FROM public.client_subscriptions cs
  CROSS JOIN public.user_api_keys ak
  WHERE cs.use_admin_credentials = TRUE
    AND ak.user_id = v_admin_id
  ON CONFLICT (client_id, provider) DO NOTHING;
END $$;
