-- Create a view to expose auth.users email field
CREATE OR REPLACE VIEW auth_users_view AS
SELECT id, email
FROM auth.users;

-- Grant access to authenticated users
GRANT SELECT ON auth_users_view TO authenticated; 