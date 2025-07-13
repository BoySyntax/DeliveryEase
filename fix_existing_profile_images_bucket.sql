-- Fix existing profile-images bucket configuration
-- Run this in Supabase Dashboard SQL Editor

-- Step 1: Update the existing profile-images bucket to accept image files
UPDATE storage.buckets 
SET 
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp']
WHERE id = 'profile-images';

-- Step 2: Remove any conflicting policies on the existing bucket
DROP POLICY IF EXISTS "Users can view their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Enable full access to own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can manage their profile images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to profile images" ON storage.objects;

-- Step 3: Create working policies for the existing bucket
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

-- Policy 2: Public read access to profile images
CREATE POLICY "Public read access to profile images" ON storage.objects
FOR SELECT 
TO public
USING (bucket_id = 'profile-images');

-- Step 4: Ensure proper permissions
GRANT ALL ON storage.objects TO authenticated;
GRANT SELECT ON storage.objects TO anon;

-- Step 5: Verify the bucket is now configured correctly
SELECT 
  'Current Bucket Config' as status,
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets 
WHERE id = 'profile-images'; 