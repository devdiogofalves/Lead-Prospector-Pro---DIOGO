CREATE TABLE public.deleted_leads_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  deleted_by UUID,
  source_table TEXT NOT NULL,
  record_id UUID,
  nome_empresa TEXT,
  telefone TEXT,
  payload JSONB NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_deleted_leads_log_user ON public.deleted_leads_log(user_id, deleted_at DESC);
CREATE INDEX idx_deleted_leads_log_table ON public.deleted_leads_log(source_table, deleted_at DESC);

ALTER TABLE public.deleted_leads_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own deletion log"
  ON public.deleted_leads_log FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own deletion log"
  ON public.deleted_leads_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins delete deletion log"
  ON public.deleted_leads_log FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_lead_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.deleted_leads_log (
    user_id, deleted_by, source_table, record_id,
    nome_empresa, telefone, payload
  ) VALUES (
    OLD.user_id,
    auth.uid(),
    TG_TABLE_NAME,
    OLD.id,
    COALESCE(
      (to_jsonb(OLD)->>'nome_empresa'),
      (to_jsonb(OLD)->>'nome'),
      (to_jsonb(OLD)->>'empresa'),
      (to_jsonb(OLD)->>'username')
    ),
    (to_jsonb(OLD)->>'telefone'),
    to_jsonb(OLD)
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_log_delete_leads
  AFTER DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_deletion();

CREATE TRIGGER trg_log_delete_linkedin
  AFTER DELETE ON public.linkedin_contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_deletion();

CREATE TRIGGER trg_log_delete_instagram
  AFTER DELETE ON public.instagram_contacts
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_deletion();

CREATE TRIGGER trg_log_delete_empresas
  AFTER DELETE ON public.empresas_enriquecidas
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_deletion();

CREATE TRIGGER trg_log_delete_jobs
  AFTER DELETE ON public.job_board_companies
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_deletion();

CREATE TRIGGER trg_log_delete_listings
  AFTER DELETE ON public.job_listings
  FOR EACH ROW EXECUTE FUNCTION public.log_lead_deletion();