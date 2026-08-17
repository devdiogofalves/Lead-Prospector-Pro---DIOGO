-- Add unique constraint on url_perfil for upsert operations
ALTER TABLE public.job_board_companies ADD CONSTRAINT job_board_companies_url_perfil_key UNIQUE (url_perfil);