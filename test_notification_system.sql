-- Test Notification System
-- Run this in your Supabase SQL Editor to verify everything is working

-- Test 1: Check if the notification columns exist
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('notification_status', 'notification_message', 'notification_created_at');

-- Test 2: Check if the RPC functions exist
SELECT 
  routine_name, 
  routine_type
FROM information_schema.routines 
WHERE routine_name IN (
  'update_order_notification',
  'get_unread_notifications_count', 
  'mark_notifications_read'
);

-- Test 3: Test the update_order_notification function with a sample order
-- (Replace 'your-order-id-here' with an actual order ID from your database)
SELECT update_order_notification(
  'your-order-id-here'::uuid, 
  'test', 
  'This is a test notification'
);

-- Test 4: Check if there are any orders with notifications
SELECT 
  id,
  customer_id,
  notification_status,
  notification_message,
  notification_created_at
FROM orders 
WHERE notification_status != 'none'
ORDER BY notification_created_at DESC
LIMIT 5;

-- Test 5: Check function permissions
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines 
WHERE routine_name IN (
  'update_order_notification',
  'get_unread_notifications_count', 
  'mark_notifications_read'
); 