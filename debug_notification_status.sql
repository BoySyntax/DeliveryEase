-- Debug notification status to understand why approval notifications aren't showing

-- Check all notifications for a specific user (replace with actual user ID)
SELECT 
    id,
    user_id,
    title,
    message,
    type,
    read,
    data,
    created_at
FROM notifications 
WHERE user_id = 'your-user-id-here'  -- Replace with actual user ID
ORDER BY created_at DESC;

-- Check if there are any notifications for approved orders
SELECT 
    n.id,
    n.title,
    n.message,
    n.created_at,
    o.id as order_id,
    o.approval_status,
    o.delivery_status
FROM notifications n
JOIN orders o ON n.data->>'orderId' = o.id::text
WHERE o.approval_status = 'approved'
ORDER BY n.created_at DESC;

-- Check the latest orders and their status
SELECT 
    id,
    customer_id,
    approval_status,
    delivery_status,
    created_at,
    updated_at
FROM orders 
ORDER BY created_at DESC 
LIMIT 10;

-- Check if the trigger is working by looking at recent order updates
SELECT 
    id,
    customer_id,
    approval_status,
    delivery_status,
    created_at,
    updated_at
FROM orders 
WHERE approval_status = 'approved' 
  AND updated_at > created_at
ORDER BY updated_at DESC 
LIMIT 5; 