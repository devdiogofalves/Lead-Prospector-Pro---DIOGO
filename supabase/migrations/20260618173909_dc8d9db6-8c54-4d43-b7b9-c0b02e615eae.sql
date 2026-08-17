
DROP POLICY IF EXISTS "admin_unipile_accounts_admin_read" ON public.admin_unipile_accounts;
CREATE POLICY "admin_unipile_accounts_admin_read"
  ON public.admin_unipile_accounts FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'email') = 'nucleodameta@gmail.com');

DROP POLICY IF EXISTS "admin_shared_apis_read" ON public.admin_shared_apis;
CREATE POLICY "admin_shared_apis_read"
  ON public.admin_shared_apis FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'nucleodameta@gmail.com'
    OR client_id = auth.uid()
  );
