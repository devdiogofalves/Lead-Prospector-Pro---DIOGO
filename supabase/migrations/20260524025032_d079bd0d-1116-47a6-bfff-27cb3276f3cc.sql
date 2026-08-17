
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding-logos', 'branding-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Branding logos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding-logos');

-- Authenticated users can upload to their own folder (folder = user_id)
CREATE POLICY "Users can upload own branding logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'branding-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own branding logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'branding-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own branding logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'branding-logos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
