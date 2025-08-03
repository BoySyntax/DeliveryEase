-- Test notification creation
-- This will create a test notification for the first user in the system
DO $$
DECLARE
    test_user_id UUID;
BEGIN
    -- Get the first user from auth.users
    SELECT id INTO test_user_id FROM auth.users LIMIT 1;
    
    IF test_user_id IS NOT NULL THEN
        -- Create a test notification
        PERFORM create_notification(
            test_user_id,
            'Test Notification',
            'This is a test notification to verify the system is working.',
            'info',
            '{"test": true}'::jsonb
        );
        
        RAISE NOTICE 'Test notification created for user: %', test_user_id;
    ELSE
        RAISE NOTICE 'No users found in the system';
    END IF;
END $$; 