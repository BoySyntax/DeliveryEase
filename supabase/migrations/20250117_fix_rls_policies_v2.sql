-- Fixed RLS policies for profiles and storage (Version 2)
-- This addresses the persistent 403 storage upload errors

-- 1. Add missing INSERT policy for profiles
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 2. SIMPLIFIED storage policies for profile images
-- Remove all existing storage policies first
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly viewable" ON storage.objects;

-- Create simpler, more permissive storage policies
CREATE POLICY "Allow authenticated users to upload profile images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-images');

CREATE POLICY "Allow authenticated users to view profile images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-images');

CREATE POLICY "Allow authenticated users to update profile images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-images');

CREATE POLICY "Allow authenticated users to delete profile images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-images');

-- 3. Fix carts policies
DROP POLICY IF EXISTS "Authenticated users can access carts" ON carts;
DROP POLICY IF EXISTS "Customers can view their own carts" ON carts;
DROP POLICY IF EXISTS "Customers can insert their own carts" ON carts;
DROP POLICY IF EXISTS "Customers can update their own carts" ON carts;
DROP POLICY IF EXISTS "Customers can delete their own carts" ON carts;

CREATE POLICY "Allow full cart access to authenticated users"
ON carts FOR ALL
TO authenticated
USING (auth.uid() = customer_id)
WITH CHECK (auth.uid() = customer_id);

-- 4. Ensure the profile-images bucket exists and is properly configured
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-images', 'profile-images', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- 5. Grant necessary permissions
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON carts TO authenticated;
GRANT ALL ON cart_items TO authenticated; 