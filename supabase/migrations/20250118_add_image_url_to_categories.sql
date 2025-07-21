-- Add image_url column to categories table
ALTER TABLE categories ADD COLUMN image_url TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN categories.image_url IS 'URL to the category image stored in Supabase Storage'; 