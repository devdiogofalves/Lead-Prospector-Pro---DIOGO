-- Add website column to job_listings for company contact
ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS site_empresa text;

-- Add sector column to help identify company type  
ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS setor text;