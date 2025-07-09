-- Fix missing RLS policies for profiles and storage
-- This migration addresses the 403 "new row violates row-level security policy" errors

-- 1. Add missing INSERT policy for profiles (needed for Google OAuth users)
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 2. Add storage policies for profile images
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;

-- Allow users to upload their own profile images
CREATE POLICY "Users can upload their own profile images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to view profile images (public read)
CREATE POLICY "Profile images are publicly viewable"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-images');

-- Allow users to update their own profile images
CREATE POLICY "Users can update their own profile images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own profile images
CREATE POLICY "Users can delete their own profile images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. Fix carts policies to be more permissive for authenticated users
DROP POLICY IF EXISTS "Authenticated users can access carts" ON carts;
CREATE POLICY "Authenticated users can access carts"
ON carts FOR ALL
TO authenticated
USING (auth.uid() = customer_id)
WITH CHECK (auth.uid() = customer_id);

-- 4. Ensure proper permissions for profiles table
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON carts TO authenticated;
GRANT ALL ON cart_items TO authenticated; 