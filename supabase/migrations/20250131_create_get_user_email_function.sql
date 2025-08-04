-- Create function to get user email from auth.users table
CREATE OR REPLACE FUNCTION get_user_email(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_email TEXT;
BEGIN
    -- Get email from auth.users table
    SELECT email INTO user_email
    FROM auth.users
    WHERE id = user_id;
    
    RETURN user_email;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_email(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_email(UUID) TO service_role; 