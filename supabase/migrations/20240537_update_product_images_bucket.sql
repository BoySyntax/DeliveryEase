-- Create product-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('product-images', 'product-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Add storage policies for product-images bucket
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'product-images' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Admin Insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'product-images' AND 
    auth.uid() IN (
      SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Admin Update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'product-images' AND 
    auth.uid() IN (
      SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
    )
  ) WITH CHECK (
    bucket_id = 'product-images' AND 
    auth.uid() IN (
      SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Admin Delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'product-images' AND 
    auth.uid() IN (
      SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
    )
  ); 