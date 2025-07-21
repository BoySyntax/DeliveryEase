-- Update the categories-images bucket to properly handle image content types
-- First, let's check if the bucket exists and update its configuration

-- Update bucket configuration to allow proper content type detection
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

-- Drop and recreate storage policies with proper content type handling
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload category images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update category images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete category images" ON storage.objects;

-- Create new policies that explicitly handle content types
CREATE POLICY "Public Access" ON storage.objects 
    FOR SELECT USING (bucket_id = 'categories-images');

CREATE POLICY "Authenticated users can upload category images" ON storage.objects 
    FOR INSERT WITH CHECK (
        bucket_id = 'categories-images' 
        AND auth.role() = 'authenticated'
        AND (storage.extension(name) = ANY(ARRAY['png', 'jpg', 'jpeg', 'gif', 'webp']))
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