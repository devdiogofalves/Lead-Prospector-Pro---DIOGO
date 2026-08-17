
-- Add CNPJ enrichment columns to leads table
ALTER TABLE public.leads
ADD COLUMN cnpj text,
ADD COLUMN razao_social text,
ADD COLUMN porte text,
ADD COLUMN natureza_juridica text,
ADD COLUMN socios text,
ADD COLUMN cnpj_validado boolean DEFAULT false;

-- Create index for CNPJ lookups
CREATE INDEX idx_leads_cnpj ON public.leads (cnpj);
CREATE INDEX idx_leads_porte ON public.leads (porte);
