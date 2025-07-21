-- Migration 1: Add image_url column to categories table
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Migration 2: Fix RLS policies for categories table
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON categories;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON categories;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON categories;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON categories;

-- Create policies for categories table
CREATE POLICY "Enable read access for all users" ON categories
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for admin users only" ON categories
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Enable update for admin users only" ON categories
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Enable delete for admin users only" ON categories
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Migration 3: Fix storage policies for categories-images bucket
-- Drop existing policies first
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload category images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update category images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete category images" ON storage.objects;

-- Create new policies
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'categories-images');

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