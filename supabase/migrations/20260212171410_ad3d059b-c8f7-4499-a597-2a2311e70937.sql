
-- Tabela de empresas enriquecidas com dados da Receita Federal
CREATE TABLE public.empresas_enriquecidas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  fonte TEXT NOT NULL DEFAULT 'google_maps',
  nome_empresa TEXT NOT NULL,
  telefone TEXT,
  endereco TEXT,
  site TEXT,
  rating NUMERIC,
  reviews INTEGER,
  cnpj TEXT NOT NULL,
  razao_social TEXT,
  nome_fantasia TEXT,
  porte TEXT,
  natureza_juridica TEXT,
  socios TEXT,
  atividade_principal TEXT,
  email TEXT,
  situacao TEXT,
  cnpj_validado BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_cnpj UNIQUE (cnpj)
);

-- Enable RLS
ALTER TABLE public.empresas_enriquecidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.empresas_enriquecidas FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.empresas_enriquecidas FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.empresas_enriquecidas FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON public.empresas_enriquecidas FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_empresas_enriquecidas_updated_at
  BEFORE UPDATE ON public.empresas_enriquecidas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.empresas_enriquecidas;
