-- Fix corrupted MIME types in profile-images bucket
-- The bucket somehow has both 'application/json' and image types
-- This script will clean it up to only allow image types

-- Update the bucket to ONLY allow image MIME types (remove any JSON types)
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp'
]
WHERE id = 'profile-images';

-- Verify the fix worked
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets 
WHERE id = 'profile-images';

-- This should show ONLY image types in allowed_mime_types, no 'application/json' 