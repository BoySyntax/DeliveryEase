-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true);

-- Enable public read access to product images
CREATE POLICY "Allow public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Allow authenticated users to upload images
CREATE POLICY "Allow authenticated upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images' AND
  auth.role() = 'authenticated'
);

-- Allow admin to manage all files
CREATE POLICY "Allow admin write"
ON storage.objects FOR ALL
USING (
  bucket_id = 'product-images' AND
  auth.role() = 'authenticated'
); 