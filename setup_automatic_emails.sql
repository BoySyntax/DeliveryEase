-- Setup Automatic Email System
-- Run this in your Supabase SQL Editor to enable automatic emails

-- 1. Add email column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Create function to get user email from auth.users
CREATE OR REPLACE FUNCTION get_user_email(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_email TEXT;
BEGIN
    SELECT email INTO user_email
    FROM auth.users
    WHERE id = user_id;
    RETURN user_email;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', 'Customer'), 'customer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 5. Update existing profiles with emails from auth.users
UPDATE profiles 
SET email = au.email 
FROM auth.users au
WHERE profiles.id = au.id 
AND profiles.email IS NULL;

-- 6. Grant permissions
GRANT EXECUTE ON FUNCTION get_user_email(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_email(UUID) TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;

-- 7. Test the setup
SELECT 'Setup complete! Testing email retrieval...' as status;

-- Test with your customer ID
SELECT 
  p.id as customer_id,
  p.name as customer_name,
  p.email as profile_email,
  get_user_email(p.id::UUID) as auth_email
FROM profiles p 
WHERE p.id = 'fd636309-2b9c-4bf5-a7a7-1b4ac7cefaef'; 