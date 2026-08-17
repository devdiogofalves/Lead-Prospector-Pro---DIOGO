CREATE TABLE public.dados4u_consultas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_consulta TEXT NOT NULL,
  valor_consultado TEXT NOT NULL,
  nome TEXT,
  cpf TEXT,
  cnpj TEXT,
  nascimento TEXT,
  sexo TEXT,
  nome_mae TEXT,
  falecido TEXT,
  situacao TEXT,
  ocupacao TEXT,
  renda TEXT,
  risco TEXT,
  celulares JSONB DEFAULT '[]'::jsonb,
  fixos JSONB DEFAULT '[]'::jsonb,
  emails JSONB DEFAULT '[]'::jsonb,
  enderecos JSONB DEFAULT '[]'::jsonb,
  sociedades JSONB DEFAULT '[]'::jsonb,
  raw_response JSONB,
  tokens_gastos INTEGER,
  lead_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_dados4u_valor ON public.dados4u_consultas(valor_consultado);
CREATE INDEX idx_dados4u_cpf ON public.dados4u_consultas(cpf);
CREATE INDEX idx_dados4u_cnpj ON public.dados4u_consultas(cnpj);
CREATE INDEX idx_dados4u_lead_id ON public.dados4u_consultas(lead_id);

ALTER TABLE public.dados4u_consultas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.dados4u_consultas FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.dados4u_consultas FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.dados4u_consultas FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON public.dados4u_consultas FOR DELETE USING (true);

CREATE TRIGGER update_dados4u_consultas_updated_at
  BEFORE UPDATE ON public.dados4u_consultas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();