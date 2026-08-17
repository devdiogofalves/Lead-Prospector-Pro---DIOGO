-- 1. Tabela de branding por usuário
CREATE TABLE public.company_branding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  company_name TEXT NOT NULL DEFAULT 'Minha Empresa',
  agent_name TEXT NOT NULL DEFAULT 'Cléo',
  agent_tagline TEXT NOT NULL DEFAULT 'Sua agente de prospecção com IA',
  logo_url TEXT,
  primary_color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.company_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own branding" ON public.company_branding
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own branding" ON public.company_branding
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own branding" ON public.company_branding
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users delete own branding" ON public.company_branding
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_company_branding_updated_at
  BEFORE UPDATE ON public.company_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. onboarding_step em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0;

-- 3. Atualizar handle_new_user para criar branding default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  INSERT INTO public.company_branding (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$function$;

-- 4. Backfill: criar branding para usuários existentes que ainda não têm
INSERT INTO public.company_branding (user_id)
SELECT p.user_id FROM public.profiles p
LEFT JOIN public.company_branding b ON b.user_id = p.user_id
WHERE b.id IS NULL;