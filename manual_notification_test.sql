-- Manual Notification Test
-- Run this in your Supabase SQL Editor to test the notification system

-- Step 1: Find a recent order to test with
SELECT 
  id,
  customer_id,
  created_at,
  total,
  approval_status
FROM orders 
ORDER BY created_at DESC 
LIMIT 5;

-- Step 2: Update an order with a test notification (replace 'ORDER_ID_HERE' with an actual order ID)
UPDATE orders 
SET 
  notification_status = 'verified',
  notification_message = 'Your order has been verified and is being prepared for delivery.',
  notification_created_at = NOW()
WHERE id = 'ORDER_ID_HERE'; -- Replace with actual order ID

-- Step 3: Check if the notification was created
SELECT 
  id,
  customer_id,
  notification_status,
  notification_message,
  notification_created_at
FROM orders 
WHERE id = 'ORDER_ID_HERE'; -- Replace with actual order ID

-- Step 4: Check all notifications for a specific customer (replace 'CUSTOMER_ID_HERE' with actual customer ID)
SELECT 
  id,
  notification_status,
  notification_message,
  notification_created_at
FROM orders 
WHERE customer_id = 'CUSTOMER_ID_HERE' -- Replace with actual customer ID
AND notification_status != 'none'
ORDER BY notification_created_at DESC; 