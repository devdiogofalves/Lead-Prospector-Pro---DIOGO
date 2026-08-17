
-- Remove overly permissive public-role policies on storage.objects for these buckets
DROP POLICY IF EXISTS "Disparos audio public delete" ON storage.objects;
DROP POLICY IF EXISTS "Disparos audio public read"   ON storage.objects;
DROP POLICY IF EXISTS "Disparos audio public update" ON storage.objects;
DROP POLICY IF EXISTS "Disparos audio public upload" ON storage.objects;
DROP POLICY IF EXISTS "Support attachments public read" ON storage.objects;

-- disparos-audio: only authenticated users can read (files are named by dispatch UUIDs and referenced from RLS-gated tables). All writes via service_role only.
CREATE POLICY "disparos_audio_authenticated_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'disparos-audio');

-- qualificacao-audio: only authenticated users can read (files under {conversation_id}/*, service_role writes only).
CREATE POLICY "qualificacao_audio_authenticated_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'qualificacao-audio');

-- support-attachments: owner (folder = auth.uid()) or admin can read.
CREATE POLICY "support_attachments_owner_or_admin_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
  )
);
