-- Test Manual Notification Update
-- Run this in your Supabase SQL Editor

-- Step 1: Find a recent order that was rejected
SELECT 
  id,
  customer_id,
  approval_status,
  notification_status,
  notification_message
FROM orders 
WHERE approval_status = 'rejected'
ORDER BY created_at DESC 
LIMIT 5;

-- Step 2: Manually update the notification status for a rejected order
-- (Replace ORDER_ID_HERE with an actual order ID from step 1)
UPDATE orders 
SET 
  notification_status = 'rejected',
  notification_message = 'Your payment has been rejected. Please contact support for more information.',
  notification_created_at = NOW()
WHERE id = 'ORDER_ID_HERE' AND approval_status = 'rejected';

-- Step 3: Verify the update
SELECT 
  id,
  customer_id,
  approval_status,
  notification_status,
  notification_message,
  notification_created_at
FROM orders 
WHERE id = 'ORDER_ID_HERE';

-- Step 4: Check all notifications for the customer
-- (Replace CUSTOMER_ID_HERE with the customer_id from step 1)
SELECT 
  id,
  notification_status,
  notification_message,
  notification_created_at
FROM orders 
WHERE customer_id = 'CUSTOMER_ID_HERE'
AND notification_status != 'none'
ORDER BY notification_created_at DESC; 