-- Fix profile-images storage bucket and policies
-- Run this in Supabase Dashboard SQL Editor

-- Update the profile-images bucket to ensure correct settings
UPDATE storage.buckets 
SET 
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp']
WHERE id = 'profile-images';

-- If bucket doesn't exist, create it
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT 'profile-images', 'profile-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp']
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'profile-images');

-- Remove ALL existing policies for profile-images to start fresh
DROP POLICY IF EXISTS "Users can view their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Enable full access to own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can manage their profile images" ON storage.objects;
DROP POLICY IF EXISTS "Public profile images access" ON storage.objects;

-- Create simple, working policies
-- Policy 1: Authenticated users can manage their own profile images
CREATE POLICY "Users can manage their profile images" ON storage.objects
FOR ALL 
TO authenticated
USING (
  bucket_id = 'profile-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'profile-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Public read access to all profile images
CREATE POLICY "Public profile images access" ON storage.objects
FOR SELECT 
TO public
USING (bucket_id = 'profile-images');

-- Grant necessary permissions
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;

-- Test the setup by checking bucket configuration
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets 
WHERE id = 'profile-images'; 