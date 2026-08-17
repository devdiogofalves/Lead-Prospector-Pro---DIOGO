-- Create leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_empresa TEXT NOT NULL,
  telefone TEXT NOT NULL,
  endereco TEXT,
  site TEXT,
  rating DECIMAL(2,1) DEFAULT 0,
  reviews INTEGER DEFAULT 0,
  especialidades TEXT,
  disparo TEXT DEFAULT 'Não' CHECK (disparo IN ('Sim', 'Não')),
  data_disparo TIMESTAMP WITH TIME ZONE,
  mensagem TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint on telefone to avoid duplicates
CREATE UNIQUE INDEX leads_telefone_unique ON public.leads (telefone);

-- Create index for faster filtering
CREATE INDEX leads_disparo_idx ON public.leads (disparo);

-- Enable Row Level Security (public access for admin use)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Create policy for public read (admin only, no auth needed for now)
CREATE POLICY "Allow public read access" ON public.leads
  FOR SELECT USING (true);

-- Create policy for public insert (webhooks)
CREATE POLICY "Allow public insert access" ON public.leads
  FOR INSERT WITH CHECK (true);

-- Create policy for public update
CREATE POLICY "Allow public update access" ON public.leads
  FOR UPDATE USING (true);

-- Create policy for public delete
CREATE POLICY "Allow public delete access" ON public.leads
  FOR DELETE USING (true);

-- Enable realtime for leads table
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();