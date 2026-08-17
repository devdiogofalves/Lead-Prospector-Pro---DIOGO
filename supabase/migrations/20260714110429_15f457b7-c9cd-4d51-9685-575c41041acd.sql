
-- Substitui policies frouxas por ownership check (folder[1] = auth.uid()).
DROP POLICY IF EXISTS "disparos_audio_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "qualificacao_audio_authenticated_read" ON storage.objects;

CREATE POLICY "disparos_audio_owner_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'disparos-audio'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "qualificacao_audio_owner_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'qualificacao-audio'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Fix WITH CHECK spoofable no deleted_leads_log.
DROP POLICY IF EXISTS "Users insert own deletion log" ON public.deleted_leads_log;
CREATE POLICY "Users insert own deletion log"
ON public.deleted_leads_log FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND auth.uid() = deleted_by);
