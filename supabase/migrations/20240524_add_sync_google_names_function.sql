-- Create function to sync Google names
CREATE OR REPLACE FUNCTION sync_google_names()
RETURNS void AS $$
BEGIN
  UPDATE profiles p
  SET name = (
    SELECT 
      COALESCE(
        NULLIF(NULLIF((u.raw_user_meta_data->>'full_name'), ''), 'N/A'),
        NULLIF(NULLIF((u.raw_user_meta_data->>'name'), ''), 'N/A'),
        NULLIF(u.email, 'N/A')
      )
    FROM auth.users u
    WHERE u.id = p.id
  )
  WHERE p.name IS NULL OR p.name = '' OR p.name = 'N/A';
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Create trigger to automatically sync names when users are created or updated
CREATE OR REPLACE FUNCTION sync_google_names_on_auth_user_change()
RETURNS trigger AS $$
BEGIN
  PERFORM sync_google_names();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_google_names_trigger ON auth.users;
CREATE TRIGGER sync_google_names_trigger
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_google_names_on_auth_user_change(); 