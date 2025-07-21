-- Create a new bucket for category images with proper configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('category-images', 'category-images', true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create storage policies for the new bucket
CREATE POLICY "Public Access" ON storage.objects 
    FOR SELECT USING (bucket_id = 'category-images');

CREATE POLICY "Authenticated users can upload category images" ON storage.objects 
    FOR INSERT WITH CHECK (
        bucket_id = 'category-images' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Authenticated users can update category images" ON storage.objects 
    FOR UPDATE USING (
        bucket_id = 'category-images' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Authenticated users can delete category images" ON storage.objects 
    FOR DELETE USING (
        bucket_id = 'category-images' 
        AND auth.role() = 'authenticated'
    ); 