-- Create storage policies for categories-images bucket
-- Allow public read access to category images
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'categories-images');

-- Allow authenticated users to upload images (will be restricted to admin in the app)
CREATE POLICY "Authenticated users can upload category images" ON storage.objects 
    FOR INSERT WITH CHECK (
        bucket_id = 'categories-images' 
        AND auth.role() = 'authenticated'
    );

-- Allow authenticated users to update images
CREATE POLICY "Authenticated users can update category images" ON storage.objects 
    FOR UPDATE USING (
        bucket_id = 'categories-images' 
        AND auth.role() = 'authenticated'
    );

-- Allow authenticated users to delete images
CREATE POLICY "Authenticated users can delete category images" ON storage.objects 
    FOR DELETE USING (
        bucket_id = 'categories-images' 
        AND auth.role() = 'authenticated'
    ); 