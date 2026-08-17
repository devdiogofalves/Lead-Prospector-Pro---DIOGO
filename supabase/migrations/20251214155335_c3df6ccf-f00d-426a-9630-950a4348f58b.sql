-- Create table for Instagram contacts
CREATE TABLE public.instagram_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL,
  nome TEXT,
  bio TEXT,
  seguidores INTEGER DEFAULT 0,
  seguindo INTEGER DEFAULT 0,
  posts INTEGER DEFAULT 0,
  whatsapp TEXT,
  whatsapp_validado BOOLEAN DEFAULT false,
  profile_url TEXT,
  disparo TEXT DEFAULT 'Não',
  data_disparo TIMESTAMP WITH TIME ZONE,
  mensagem TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instagram_contacts ENABLE ROW LEVEL SECURITY;

-- Create public access policies (admin-only system)
CREATE POLICY "Allow public read access" ON public.instagram_contacts FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.instagram_contacts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.instagram_contacts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON public.instagram_contacts FOR DELETE USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_instagram_contacts_updated_at
  BEFORE UPDATE ON public.instagram_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();