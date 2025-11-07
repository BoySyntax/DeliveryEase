-- Add phone field to profiles table
ALTER TABLE profiles ADD COLUMN phone TEXT;

-- Add comment
COMMENT ON COLUMN profiles.phone IS 'Driver phone number for contact purposes';

















