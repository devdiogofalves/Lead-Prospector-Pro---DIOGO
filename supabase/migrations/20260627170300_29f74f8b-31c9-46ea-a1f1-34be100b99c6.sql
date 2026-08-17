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
    COALESCE(wgl.pushname, wgl.phone, wgl.member_jid, ''),
    COALESCE(wgl.phone, wgl.member_jid), wgl.group_name, wgl.group_name,
    COALESCE(wgl.disparo,'Não'), wgl.data_disparo, wgl.created_at,
    jsonb_build_object('group_jid', wgl.group_jid, 'group_name', wgl.group_name,
      'member_jid', wgl.member_jid, 'phone', wgl.phone, 'private_only', wgl.phone IS NULL)
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

ALTER VIEW public.leads_unified SET (security_invoker = true);
GRANT SELECT ON public.leads_unified TO authenticated;
GRANT SELECT ON public.leads_unified TO service_role;