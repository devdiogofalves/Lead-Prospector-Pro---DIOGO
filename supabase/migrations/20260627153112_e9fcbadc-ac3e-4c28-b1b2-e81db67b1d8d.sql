
-- 1. TAGS
CREATE TABLE public.lead_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#64748b',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tags TO authenticated;
GRANT ALL ON public.lead_tags TO service_role;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead_tags" ON public.lead_tags FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.lead_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tag_id, source, source_id)
);
CREATE INDEX idx_lta_user_source ON public.lead_tag_assignments(user_id, source, source_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tag_assignments TO authenticated;
GRANT ALL ON public.lead_tag_assignments TO service_role;
ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead_tag_assignments" ON public.lead_tag_assignments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. FOLDERS
CREATE TABLE public.lead_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_folders TO authenticated;
GRANT ALL ON public.lead_folders TO service_role;
ALTER TABLE public.lead_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead_folders" ON public.lead_folders FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.lead_folder_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES public.lead_folders(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (folder_id, source, source_id)
);
CREATE INDEX idx_lfi_user_source ON public.lead_folder_items(user_id, source, source_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_folder_items TO authenticated;
GRANT ALL ON public.lead_folder_items TO service_role;
ALTER TABLE public.lead_folder_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead_folder_items" ON public.lead_folder_items FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. PIPELINE STATUS
CREATE TABLE public.lead_pipeline_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'novo',
  pipeline_card_id UUID REFERENCES public.pipeline_cards(id) ON DELETE SET NULL,
  last_dispatched_at TIMESTAMPTZ,
  last_dispatched_channel TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX idx_lps_user_status ON public.lead_pipeline_status(user_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_pipeline_status TO authenticated;
GRANT ALL ON public.lead_pipeline_status TO service_role;
ALTER TABLE public.lead_pipeline_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lead_pipeline_status" ON public.lead_pipeline_status FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_lps_updated BEFORE UPDATE ON public.lead_pipeline_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_lf_updated BEFORE UPDATE ON public.lead_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. VIEW UNIFICADA
CREATE OR REPLACE VIEW public.leads_unified AS
  SELECT
    l.id AS source_id, 'maps'::text AS source, l.user_id,
    COALESCE(l.nome_empresa,'') AS nome,
    l.telefone AS identificador,
    l.nome_empresa AS empresa,
    l.endereco AS contexto,
    l.disparo, l.data_disparo, l.created_at,
    jsonb_build_object(
      'site', l.site, 'rating', l.rating, 'reviews', l.reviews,
      'especialidades', l.especialidades, 'cnpj', l.cnpj, 'razao_social', l.razao_social
    ) AS extra
  FROM public.leads l
  UNION ALL
  SELECT
    lc.id, 'linkedin', lc.user_id,
    COALESCE(lc.nome,''),
    COALESCE(lc.linkedin_url, lc.telefone, lc.email),
    lc.empresa, lc.cargo,
    COALESCE(lc.disparo,'Não'), lc.data_disparo, lc.created_at,
    jsonb_build_object('cargo', lc.cargo, 'linkedin_url', lc.linkedin_url,
      'email', lc.email, 'telefone', lc.telefone, 'localizacao', lc.localizacao)
  FROM public.linkedin_contacts lc
  UNION ALL
  SELECT
    ic.id, 'instagram', ic.user_id,
    COALESCE(ic.nome, ic.username, ''),
    ic.username, NULL, ic.bio,
    COALESCE(ic.disparo,'Não'), ic.data_disparo, ic.created_at,
    jsonb_build_object('username', ic.username, 'seguidores', ic.seguidores,
      'whatsapp', ic.whatsapp, 'email', ic.email, 'site', ic.site,
      'profile_url', ic.profile_url)
  FROM public.instagram_contacts ic
  UNION ALL
  SELECT
    wgl.id, 'whatsapp_group', wgl.user_id,
    COALESCE(wgl.pushname, wgl.member_jid, ''),
    wgl.phone, wgl.group_name, wgl.group_name,
    COALESCE(wgl.disparo,'Não'), wgl.data_disparo, wgl.created_at,
    jsonb_build_object('group_jid', wgl.group_jid, 'group_name', wgl.group_name,
      'member_jid', wgl.member_jid)
  FROM public.whatsapp_group_leads wgl
  UNION ALL
  SELECT
    ihl.id, 'instagram_hashtag', ihl.user_id,
    COALESCE(ihl.full_name, ihl.username, ''),
    ihl.username, NULL, ihl.bio,
    COALESCE(ihl.disparo,'Não'), ihl.data_disparo, ihl.created_at,
    jsonb_build_object('hashtag', ihl.hashtag, 'post_url', ihl.post_url,
      'followers', ihl.followers)
  FROM public.instagram_hashtag_leads ihl;

GRANT SELECT ON public.leads_unified TO authenticated;
GRANT SELECT ON public.leads_unified TO service_role;

-- 5. AUTO-CRM
CREATE OR REPLACE FUNCTION public.auto_crm_on_dispatch_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source TEXT;
  v_source_id UUID;
  v_card_id UUID;
  v_existing UUID;
  v_nome TEXT;
  v_contato TEXT;
BEGIN
  IF NEW.status <> 'sent' OR COALESCE(OLD.status,'') = 'sent' THEN
    RETURN NEW;
  END IF;

  v_source := NEW.source;
  v_source_id := NEW.source_id;
  IF v_source IS NULL OR v_source_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pipeline_card_id INTO v_existing
  FROM public.lead_pipeline_status
  WHERE source = v_source AND source_id = v_source_id;

  IF v_existing IS NULL THEN
    SELECT nome, identificador INTO v_nome, v_contato
    FROM public.leads_unified
    WHERE source = v_source AND source_id = v_source_id
    LIMIT 1;

    INSERT INTO public.pipeline_cards
      (user_id, nome_empresa, contato, telefone, origem, estagio, observacoes)
    VALUES
      (NEW.user_id, COALESCE(v_nome, NEW.nome_empresa), v_contato, NEW.telefone,
       v_source, 'novo_lead',
       'Criado automaticamente após disparo via ' || COALESCE(NEW.channel,'whatsapp'))
    RETURNING id INTO v_card_id;

    INSERT INTO public.lead_pipeline_status
      (user_id, source, source_id, status, pipeline_card_id,
       last_dispatched_at, last_dispatched_channel)
    VALUES
      (NEW.user_id, v_source, v_source_id, 'contactado', v_card_id, now(), NEW.channel)
    ON CONFLICT (source, source_id) DO UPDATE
      SET status = 'contactado',
          pipeline_card_id = EXCLUDED.pipeline_card_id,
          last_dispatched_at = now(),
          last_dispatched_channel = EXCLUDED.last_dispatched_channel,
          updated_at = now();
  ELSE
    UPDATE public.lead_pipeline_status
       SET last_dispatched_at = now(),
           last_dispatched_channel = NEW.channel,
           status = CASE WHEN status = 'novo' THEN 'contactado' ELSE status END,
           updated_at = now()
     WHERE source = v_source AND source_id = v_source_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_crm_on_dispatch_sent ON public.dispatch_queue;
CREATE TRIGGER trg_auto_crm_on_dispatch_sent
  AFTER INSERT OR UPDATE OF status ON public.dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.auto_crm_on_dispatch_sent();
