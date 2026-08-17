
-- Tabela de licenças da extensão
CREATE TABLE public.extension_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  device_id text,
  device_info jsonb,
  active boolean NOT NULL DEFAULT true,
  notes text,
  activated_at timestamptz,
  last_used_at timestamptz,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_extension_licenses_key ON public.extension_licenses(license_key);
CREATE INDEX idx_extension_licenses_user ON public.extension_licenses(user_id);

ALTER TABLE public.extension_licenses ENABLE ROW LEVEL SECURITY;

-- Admins fazem tudo
CREATE POLICY "Admins manage all licenses"
ON public.extension_licenses
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Usuários veem suas próprias
CREATE POLICY "Users view own licenses"
ON public.extension_licenses
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_extension_licenses_updated_at
BEFORE UPDATE ON public.extension_licenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
