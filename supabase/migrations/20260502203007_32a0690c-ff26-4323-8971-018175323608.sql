
-- DEFAULT auth.uid() para todas as colunas user_id
ALTER TABLE public.leads                ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.instagram_contacts   ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.linkedin_contacts    ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.empresas_enriquecidas ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.job_board_companies  ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.job_listings         ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.dados4u_consultas    ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.disparos_humanizados ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.saved_webhooks       ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Constraints únicas compostas (cada cliente tem seu próprio espaço)
-- Drop antigas se existirem
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_telefone_key;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_telefone_user_id_key;
ALTER TABLE public.leads ADD CONSTRAINT leads_telefone_user_id_key UNIQUE (telefone, user_id);

ALTER TABLE public.instagram_contacts DROP CONSTRAINT IF EXISTS instagram_contacts_username_key;
ALTER TABLE public.instagram_contacts DROP CONSTRAINT IF EXISTS instagram_contacts_username_user_id_key;
ALTER TABLE public.instagram_contacts ADD CONSTRAINT instagram_contacts_username_user_id_key UNIQUE (username, user_id);

ALTER TABLE public.linkedin_contacts DROP CONSTRAINT IF EXISTS linkedin_contacts_linkedin_url_key;
ALTER TABLE public.linkedin_contacts DROP CONSTRAINT IF EXISTS linkedin_contacts_linkedin_url_user_id_key;
ALTER TABLE public.linkedin_contacts ADD CONSTRAINT linkedin_contacts_linkedin_url_user_id_key UNIQUE (linkedin_url, user_id);

ALTER TABLE public.empresas_enriquecidas DROP CONSTRAINT IF EXISTS empresas_enriquecidas_cnpj_key;
ALTER TABLE public.empresas_enriquecidas DROP CONSTRAINT IF EXISTS empresas_enriquecidas_cnpj_user_id_key;
ALTER TABLE public.empresas_enriquecidas ADD CONSTRAINT empresas_enriquecidas_cnpj_user_id_key UNIQUE (cnpj, user_id);
