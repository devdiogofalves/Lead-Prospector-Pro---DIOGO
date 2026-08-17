-- Create table for job board companies (Catho/Infojobs)
CREATE TABLE public.job_board_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_empresa TEXT NOT NULL,
  segmento TEXT,
  porte TEXT,
  localizacao TEXT,
  descricao TEXT,
  site TEXT,
  telefone TEXT,
  email TEXT,
  vagas_abertas INTEGER DEFAULT 0,
  fonte TEXT NOT NULL, -- 'catho' or 'infojobs'
  url_perfil TEXT,
  disparo TEXT DEFAULT 'Não',
  data_disparo TIMESTAMP WITH TIME ZONE,
  mensagem TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.job_board_companies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public access
CREATE POLICY "Allow public read access" ON public.job_board_companies FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.job_board_companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.job_board_companies FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON public.job_board_companies FOR DELETE USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_job_board_companies_updated_at
BEFORE UPDATE ON public.job_board_companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_board_companies;