-- Test notification creation
-- This will help verify that the notification system is working

-- Test function to manually create a notification
CREATE OR REPLACE FUNCTION test_create_notification()
RETURNS TEXT AS $$
DECLARE
  test_user_id UUID;
  notification_id UUID;
BEGIN
  -- Get the first user (for testing purposes)
  SELECT id INTO test_user_id FROM auth.users LIMIT 1;
  
  IF test_user_id IS NULL THEN
    RETURN 'No users found for testing';
  END IF;
  
  -- Create a test notification
  SELECT create_notification(
    test_user_id,
    'Test Notification',
    'This is a test notification to verify the system is working.',
    'info',
    '{"test": true}'::jsonb
  ) INTO notification_id;
  
  IF notification_id IS NULL THEN
    RETURN 'Failed to create test notification';
  ELSE
    RETURN 'Test notification created successfully with ID: ' || notification_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 