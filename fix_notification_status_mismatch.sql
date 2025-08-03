-- Fix Notification Status Mismatch
-- Run this in your Supabase SQL Editor

-- Step 1: Check current status of orders
SELECT 
  id,
  customer_id,
  approval_status,
  delivery_status,
  notification_status,
  notification_message
FROM orders 
WHERE notification_status != 'none'
ORDER BY created_at DESC 
LIMIT 10;

-- Step 2: Fix notification status for rejected orders
UPDATE orders 
SET 
  notification_status = 'rejected',
  notification_message = 'Your payment has been rejected. Please contact support for more information.',
  notification_created_at = NOW()
WHERE approval_status = 'rejected' 
AND notification_status != 'rejected';

-- Step 3: Fix notification status for approved orders
UPDATE orders 
SET 
  notification_status = 'verified',
  notification_message = 'Your order has been verified and is being prepared for delivery.',
  notification_created_at = NOW()
WHERE approval_status = 'approved' 
AND notification_status != 'verified';

-- Step 4: Fix notification status for pending orders
UPDATE orders 
SET 
  notification_status = 'placed',
  notification_message = 'Your order has been successfully placed and is pending approval.',
  notification_created_at = created_at
WHERE approval_status = 'pending' 
AND notification_status != 'placed';

-- Step 5: Fix notification status for delivering orders
UPDATE orders 
SET 
  notification_status = 'delivering',
  notification_message = 'Your order is now out for delivery. Estimated delivery: ' || (CURRENT_DATE + INTERVAL '1 day')::text,
  notification_created_at = NOW()
WHERE delivery_status = 'delivering' 
AND notification_status != 'delivering';

-- Step 6: Fix notification status for delivered orders
UPDATE orders 
SET 
  notification_status = 'delivered',
  notification_message = 'Your order has been successfully delivered. Thank you for choosing DeliveryEase!',
  notification_created_at = NOW()
WHERE delivery_status = 'delivered' 
AND notification_status != 'delivered';

-- Step 7: Verify the fixes
SELECT 
  id,
  customer_id,
  approval_status,
  delivery_status,
  notification_status,
  notification_message,
  notification_created_at
FROM orders 
WHERE notification_status != 'none'
ORDER BY notification_created_at DESC 
LIMIT 10;

-- Step 8: Check if any mismatches remain
SELECT 
  id,
  approval_status,
  delivery_status,
  notification_status,
  CASE 
    WHEN approval_status = 'rejected' AND notification_status != 'rejected' THEN 'MISMATCH - Should be rejected'
    WHEN approval_status = 'approved' AND notification_status != 'verified' THEN 'MISMATCH - Should be verified'
    WHEN approval_status = 'pending' AND notification_status != 'placed' THEN 'MISMATCH - Should be placed'
    WHEN delivery_status = 'delivering' AND notification_status != 'delivering' THEN 'MISMATCH - Should be delivering'
    WHEN delivery_status = 'delivered' AND notification_status != 'delivered' THEN 'MISMATCH - Should be delivered'
    ELSE 'OK'
  END as status_check
FROM orders 
WHERE notification_status != 'none'
ORDER BY created_at DESC; 