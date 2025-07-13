-- Fix RLS policies for carts and storage
-- This addresses the 406 cart access errors and file upload issues

-- Drop existing cart policies
DROP POLICY IF EXISTS "Users can view their own cart" ON carts;
DROP POLICY IF EXISTS "Users can create their own cart" ON carts;
DROP POLICY IF EXISTS "Users can update their own cart" ON carts;

-- Create comprehensive cart policies
CREATE POLICY "Enable full access to own cart" ON carts
FOR ALL 
TO authenticated
USING (customer_id = auth.uid())
WITH CHECK (customer_id = auth.uid());

-- Drop existing cart_items policies
DROP POLICY IF EXISTS "Users can view their own cart items" ON cart_items;
DROP POLICY IF EXISTS "Users can create their own cart items" ON cart_items;
DROP POLICY IF EXISTS "Users can update their own cart items" ON cart_items;
DROP POLICY IF EXISTS "Users can delete their own cart items" ON cart_items;

-- Create comprehensive cart_items policies
CREATE POLICY "Enable full access to own cart items" ON cart_items
FOR ALL 
TO authenticated
USING (cart_id IN (SELECT id FROM carts WHERE customer_id = auth.uid()))
WITH CHECK (cart_id IN (SELECT id FROM carts WHERE customer_id = auth.uid()));

-- Ensure profile-images bucket exists and has correct policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-images', 'profile-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];

-- Drop existing storage policies for profile-images
DROP POLICY IF EXISTS "Users can view their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly viewable" ON storage.objects;

-- Create comprehensive storage policies for profile-images
CREATE POLICY "Enable full access to own profile images" ON storage.objects
FOR ALL 
TO authenticated
USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access to profile images
CREATE POLICY "Profile images are publicly readable" ON storage.objects
FOR SELECT 
TO public
USING (bucket_id = 'profile-images');

-- Grant necessary permissions
GRANT ALL ON carts TO authenticated;
GRANT ALL ON cart_items TO authenticated;
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated; 