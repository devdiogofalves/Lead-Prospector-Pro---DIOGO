
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS nome_contato text,
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS segmento text;

CREATE OR REPLACE VIEW public.leads_unified AS
SELECT l.id AS source_id,
  'maps'::text AS source,
  l.user_id,
  COALESCE(l.nome_contato, l.nome_empresa, ''::text) AS nome,
  l.telefone AS identificador,
  l.nome_empresa AS empresa,
  COALESCE(l.endereco, l.cidade) AS contexto,
  l.disparo,
  l.data_disparo,
  l.created_at,
  jsonb_build_object(
    'site', l.site, 'rating', l.rating, 'reviews', l.reviews,
    'especialidades', l.especialidades, 'cnpj', l.cnpj, 'razao_social', l.razao_social,
    'nome_contato', l.nome_contato, 'cargo', l.cargo,
    'cidade', l.cidade, 'segmento', l.segmento, 'email', l.email
  ) AS extra
FROM public.leads l
UNION ALL
SELECT lc.id AS source_id, 'linkedin'::text AS source, lc.user_id,
  COALESCE(lc.nome, ''::text) AS nome,
  COALESCE(lc.linkedin_url, lc.telefone, lc.email) AS identificador,
  lc.empresa, lc.cargo AS contexto,
  COALESCE(lc.disparo, 'Não'::text) AS disparo, lc.data_disparo, lc.created_at,
  jsonb_build_object('cargo', lc.cargo, 'linkedin_url', lc.linkedin_url, 'email', lc.email, 'telefone', lc.telefone, 'localizacao', lc.localizacao) AS extra
FROM public.linkedin_contacts lc
UNION ALL
SELECT ic.id AS source_id, 'instagram'::text AS source, ic.user_id,
  COALESCE(ic.nome, ic.username, ''::text) AS nome,
  ic.username AS identificador, NULL::text AS empresa,
  ic.bio AS contexto,
  COALESCE(ic.disparo, 'Não'::text) AS disparo, ic.data_disparo, ic.created_at,
  jsonb_build_object('username', ic.username, 'seguidores', ic.seguidores, 'whatsapp', ic.whatsapp, 'email', ic.email, 'site', ic.site, 'profile_url', ic.profile_url) AS extra
FROM public.instagram_contacts ic
UNION ALL
SELECT wgl.id AS source_id, 'whatsapp_group'::text AS source, wgl.user_id,
  COALESCE(wgl.pushname, wgl.phone, wgl.member_jid, ''::text) AS nome,
  COALESCE(wgl.phone, wgl.member_jid) AS identificador,
  wgl.group_name AS empresa, wgl.group_name AS contexto,
  COALESCE(wgl.disparo, 'Não'::text) AS disparo, wgl.data_disparo, wgl.created_at,
  jsonb_build_object('group_jid', wgl.group_jid, 'group_name', wgl.group_name, 'member_jid', wgl.member_jid, 'phone', wgl.phone, 'private_only', (wgl.phone IS NULL)) AS extra
FROM public.whatsapp_group_leads wgl
UNION ALL
SELECT ihl.id AS source_id, 'instagram_hashtag'::text AS source, ihl.user_id,
  COALESCE(ihl.full_name, ihl.username, ''::text) AS nome,
  ihl.username AS identificador, NULL::text AS empresa,
  COALESCE(ihl.post_caption, ihl.bio) AS contexto,
  COALESCE(ihl.disparo, 'Não'::text) AS disparo, ihl.data_disparo, ihl.created_at,
  jsonb_build_object('username', ihl.username, 'hashtag', ihl.hashtag, 'post_url', ihl.post_url, 'caption', ihl.post_caption, 'followers', ihl.followers) AS extra
FROM public.instagram_hashtag_leads ihl;

GRANT SELECT ON public.leads_unified TO authenticated;
GRANT SELECT ON public.leads_unified TO service_role;
