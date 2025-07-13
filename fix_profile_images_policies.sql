-- Fix profile-images storage policies
-- Run this in Supabase Dashboard SQL Editor

-- Step 1: Drop all existing policies for profile-images bucket
DROP POLICY IF EXISTS "Allow authenticated users to insert into profile-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload profile images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own files to profile-images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Enable full access to own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can manage their profile images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to profile images" ON storage.objects;

-- Step 2: Create simple working policies
-- Policy 1: Allow authenticated users full access to their own folder
CREATE POLICY "profile_images_authenticated_access" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'profile-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'profile-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Allow public read access for viewing images
CREATE POLICY "profile_images_public_read" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'profile-images');

-- Step 3: Verify policies are created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' 
  AND policyname LIKE '%profile_images%'
ORDER BY policyname; 