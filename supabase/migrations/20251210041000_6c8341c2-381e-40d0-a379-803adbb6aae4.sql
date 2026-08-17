-- Create table for LinkedIn profiles/contacts
CREATE TABLE public.linkedin_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cargo TEXT,
  empresa TEXT,
  localizacao TEXT,
  linkedin_url TEXT UNIQUE,
  email TEXT,
  telefone TEXT,
  sobre TEXT,
  conexoes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  disparo TEXT DEFAULT 'Não'::text,
  data_disparo TIMESTAMP WITH TIME ZONE,
  mensagem TEXT
);

-- Enable Row Level Security
ALTER TABLE public.linkedin_contacts ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (admin-only system)
CREATE POLICY "Allow public read access" 
ON public.linkedin_contacts 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert access" 
ON public.linkedin_contacts 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update access" 
ON public.linkedin_contacts 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete access" 
ON public.linkedin_contacts 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_linkedin_contacts_updated_at
BEFORE UPDATE ON public.linkedin_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();