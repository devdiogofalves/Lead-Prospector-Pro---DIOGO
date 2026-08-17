
CREATE POLICY "users read own social assets" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'social-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users insert own social assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'social-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users update own social assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'social-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users delete own social assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'social-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
