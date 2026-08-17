
CREATE TABLE public.admin_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  descricao TEXT NOT NULL,
  categoria TEXT,
  valor NUMERIC NOT NULL DEFAULT 0,
  recorrente BOOLEAN NOT NULL DEFAULT true,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_expenses TO authenticated;
GRANT ALL ON public.admin_expenses TO service_role;

ALTER TABLE public.admin_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage expenses"
  ON public.admin_expenses
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_admin_expenses_updated_at
  BEFORE UPDATE ON public.admin_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
