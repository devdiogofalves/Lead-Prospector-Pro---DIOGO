-- Create table for job listings (Catho/Infojobs)
CREATE TABLE public.job_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo_vaga TEXT NOT NULL,
  empresa TEXT,
  email TEXT,
  telefone TEXT,
  localizacao TEXT,
  salario TEXT,
  descricao TEXT,
  requisitos TEXT,
  fonte TEXT NOT NULL, -- 'catho' or 'infojobs'
  url_vaga TEXT,
  disparo TEXT DEFAULT 'Não',
  data_disparo TIMESTAMP WITH TIME ZONE,
  mensagem TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT job_listings_url_vaga_key UNIQUE (url_vaga)
);

-- Enable Row Level Security
ALTER TABLE public.job_listings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public access
CREATE POLICY "Allow public read access" ON public.job_listings FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.job_listings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.job_listings FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON public.job_listings FOR DELETE USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_job_listings_updated_at
BEFORE UPDATE ON public.job_listings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_listings;