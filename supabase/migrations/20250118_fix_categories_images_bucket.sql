-- Fix the existing categories-images bucket configuration
UPDATE storage.buckets 
SET public = true, 
    file_size_limit = 52428800, -- 50MB
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
WHERE id = 'categories-images';

-- Ensure the bucket exists with proper settings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('categories-images', 'categories-images', true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop existing storage policies for categories-images
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload category images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update category images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete category images" ON storage.objects;

-- Create new storage policies for categories-images bucket
CREATE POLICY "Public Access" ON storage.objects 
    FOR SELECT USING (bucket_id = 'categories-images');

CREATE POLICY "Authenticated users can upload category images" ON storage.objects 
    FOR INSERT WITH CHECK (
        bucket_id = 'categories-images' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Authenticated users can update category images" ON storage.objects 
    FOR UPDATE USING (
        bucket_id = 'categories-images' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Authenticated users can delete category images" ON storage.objects 
    FOR DELETE USING (
        bucket_id = 'categories-images' 
        AND auth.role() = 'authenticated'
    ); 