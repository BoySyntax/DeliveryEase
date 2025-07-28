-- Comprehensive Fix for Profile Images Storage Issue
-- Run this in Supabase Dashboard SQL Editor

-- Step 1: Ensure the profile-images bucket exists with correct configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-images', 'profile-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];

-- Step 2: Remove ALL existing conflicting policies
DROP POLICY IF EXISTS "Users can view their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Enable full access to own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view profile images" ON storage.objects;

-- Step 3: Create comprehensive policies that should work
-- Policy 1: Authenticated users can manage their own profile images (CRUD operations)
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

-- Policy 2: Public read access to all profile images (for displaying avatars)
CREATE POLICY "Public read access to profile images" ON storage.objects
FOR SELECT 
TO public
USING (bucket_id = 'profile-images');

-- Step 4: Grant necessary permissions explicitly
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;
GRANT SELECT ON storage.objects TO anon;

-- Step 5: Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Step 6: Verify the configuration
SELECT 
  'Bucket Configuration' as check_type,
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets 
WHERE id = 'profile-images'
UNION ALL
SELECT 
  'Storage Policies' as check_type,
  polname as id,
  polcmd as name,
  polpermissive::text as public,
  null as file_size_limit,
  ARRAY[pol.polroles::text] as allowed_mime_types
FROM pg_policy pol
JOIN pg_class cls ON pol.polrelid = cls.oid
WHERE cls.relname = 'objects' 
  AND pol.polname LIKE '%profile%';

-- Step 7: Test query - this should return the bucket if everything is set up correctly
SELECT 'Test Result' as test_type, count(*) as profile_images_bucket_count 
FROM storage.buckets 
WHERE id = 'profile-images' AND public = true; 