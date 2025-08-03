-- Test the notification trigger by creating a test order
-- This will help us debug why notifications aren't being created

-- First, let's check if the trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'new_order_notification_trigger';

-- Check if the function exists
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_name = 'handle_new_order_notification';

-- Test creating a notification manually
SELECT create_notification(
    'test-user-id',  -- Replace with actual user ID
    'Test Notification',
    'This is a test notification',
    'info',
    '{"orderId": "test-order-id"}'::jsonb
);

-- Check if notifications table exists and has data
SELECT COUNT(*) as notification_count FROM notifications;

-- Check the latest notifications
SELECT 
    id,
    user_id,
    title,
    message,
    type,
    read,
    created_at
FROM notifications 
ORDER BY created_at DESC 
LIMIT 5; 