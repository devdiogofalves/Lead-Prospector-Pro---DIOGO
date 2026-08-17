
-- =======================================================
-- FASE 1b: Multi-tenant — adiciona user_id em todas as tabelas de dados
-- =======================================================

-- 1. Promover Alex Barros a admin (será o dono dos dados existentes)
INSERT INTO public.user_roles (user_id, role)
VALUES ('18913027-765c-41af-8962-113d96120fbf', 'admin')
ON CONFLICT DO NOTHING;

-- 2. Adicionar coluna user_id em todas as tabelas de leads
ALTER TABLE public.leads                ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.instagram_contacts   ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.linkedin_contacts    ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.empresas_enriquecidas ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.job_board_companies  ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.job_listings         ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.dados4u_consultas    ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.disparos_humanizados ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.saved_webhooks       ADD COLUMN IF NOT EXISTS user_id uuid;

-- 3. Backfill: atribuir todos os registros existentes ao admin
UPDATE public.leads                SET user_id = '18913027-765c-41af-8962-113d96120fbf' WHERE user_id IS NULL;
UPDATE public.instagram_contacts   SET user_id = '18913027-765c-41af-8962-113d96120fbf' WHERE user_id IS NULL;
UPDATE public.linkedin_contacts    SET user_id = '18913027-765c-41af-8962-113d96120fbf' WHERE user_id IS NULL;
UPDATE public.empresas_enriquecidas SET user_id = '18913027-765c-41af-8962-113d96120fbf' WHERE user_id IS NULL;
UPDATE public.job_board_companies  SET user_id = '18913027-765c-41af-8962-113d96120fbf' WHERE user_id IS NULL;
UPDATE public.job_listings         SET user_id = '18913027-765c-41af-8962-113d96120fbf' WHERE user_id IS NULL;
UPDATE public.dados4u_consultas    SET user_id = '18913027-765c-41af-8962-113d96120fbf' WHERE user_id IS NULL;
UPDATE public.disparos_humanizados SET user_id = '18913027-765c-41af-8962-113d96120fbf' WHERE user_id IS NULL;
UPDATE public.saved_webhooks       SET user_id = '18913027-765c-41af-8962-113d96120fbf' WHERE user_id IS NULL;

-- 4. NOT NULL + índice em todas
ALTER TABLE public.leads                ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.instagram_contacts   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.linkedin_contacts    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.empresas_enriquecidas ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.job_board_companies  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.job_listings         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.dados4u_consultas    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.disparos_humanizados ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.saved_webhooks       ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_user_id                ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_contacts_user_id   ON public.instagram_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_contacts_user_id    ON public.linkedin_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_empresas_enriquecidas_user_id ON public.empresas_enriquecidas(user_id);
CREATE INDEX IF NOT EXISTS idx_job_board_companies_user_id  ON public.job_board_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_user_id         ON public.job_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_dados4u_consultas_user_id    ON public.dados4u_consultas(user_id);
CREATE INDEX IF NOT EXISTS idx_disparos_humanizados_user_id ON public.disparos_humanizados(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_webhooks_user_id       ON public.saved_webhooks(user_id);

-- 5. Substituir RLS "public true" por RLS por dono em todas as tabelas
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'leads','instagram_contacts','linkedin_contacts','empresas_enriquecidas',
    'job_board_companies','job_listings','dados4u_consultas','disparos_humanizados','saved_webhooks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow public read access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public insert access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public update access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public delete access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public read"   ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public delete" ON public.%I', t);

    EXECUTE format('CREATE POLICY "Users view own %1$s"   ON public.%1$I FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Users insert own %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "Users update own %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "Users delete own %1$s" ON public.%1$I FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;
