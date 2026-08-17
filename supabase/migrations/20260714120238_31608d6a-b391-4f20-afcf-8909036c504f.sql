DROP INDEX IF EXISTS public.leads_telefone_unique;
ALTER TABLE public.leads ALTER COLUMN telefone DROP NOT NULL;