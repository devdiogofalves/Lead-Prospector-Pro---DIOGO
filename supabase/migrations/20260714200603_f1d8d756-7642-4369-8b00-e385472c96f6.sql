-- Fase de isolamento cross-tenant nos scrapers de vaga.
-- Antes: UNIQUE global em (url_perfil) e (url_vaga) fazia o segundo tenant
-- ser silenciosamente ignorado no upsert. Agora unicidade é por (url, user_id).

ALTER TABLE public.job_board_companies
  DROP CONSTRAINT IF EXISTS job_board_companies_url_perfil_key;

DROP INDEX IF EXISTS public.job_board_companies_url_perfil_key;

ALTER TABLE public.job_board_companies
  ADD CONSTRAINT job_board_companies_url_perfil_user_id_key
  UNIQUE (url_perfil, user_id);

ALTER TABLE public.job_listings
  DROP CONSTRAINT IF EXISTS job_listings_url_vaga_key;

DROP INDEX IF EXISTS public.job_listings_url_vaga_key;

ALTER TABLE public.job_listings
  ADD CONSTRAINT job_listings_url_vaga_user_id_key
  UNIQUE (url_vaga, user_id);