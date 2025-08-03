-- Manual fix to add missing notifications for approved orders

-- First, let's see what orders are approved but don't have verification notifications
WITH approved_orders AS (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.approval_status,
        o.total
    FROM orders o
    WHERE o.approval_status = 'approved'
),
existing_verified_notifications AS (
    SELECT 
        (n.data->>'orderId')::uuid as order_id
    FROM notifications n
    WHERE n.title = 'Order Verified'
)
SELECT 
    ao.order_id,
    ao.customer_id,
    ao.total,
    CASE 
        WHEN en.order_id IS NULL THEN 'MISSING NOTIFICATION'
        ELSE 'HAS NOTIFICATION'
    END as notification_status
FROM approved_orders ao
LEFT JOIN existing_verified_notifications en ON ao.order_id = en.order_id
ORDER BY ao.order_id;

-- Now let's add the missing notifications
WITH approved_orders AS (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.approval_status,
        o.total
    FROM orders o
    WHERE o.approval_status = 'approved'
),
existing_verified_notifications AS (
    SELECT 
        (n.data->>'orderId')::uuid as order_id
    FROM notifications n
    WHERE n.title = 'Order Verified'
)
INSERT INTO notifications (user_id, title, message, type, data, created_at)
SELECT 
    ao.customer_id,
    'Order Verified',
    'Your order has been verified and is being prepared for delivery.',
    'success',
    json_build_object(
        'orderId', ao.order_id,
        'status', 'verified',
        'total', ao.total
    ),
    NOW()
FROM approved_orders ao
LEFT JOIN existing_verified_notifications en ON ao.order_id = en.order_id
WHERE en.order_id IS NULL;

-- Show the results
SELECT 
    'Added verification notifications' as action,
    COUNT(*) as count
FROM (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.approval_status,
        o.total
    FROM orders o
    WHERE o.approval_status = 'approved'
) ao
LEFT JOIN (
    SELECT 
        (n.data->>'orderId')::uuid as order_id
    FROM notifications n
    WHERE n.title = 'Order Verified'
) en ON ao.order_id = en.order_id
WHERE en.order_id IS NULL;

-- Show all notifications to verify
SELECT 
    n.id,
    n.user_id,
    n.title,
    n.message,
    n.type,
    n.created_at,
    o.id as order_id,
    o.approval_status,
    o.delivery_status
FROM notifications n
LEFT JOIN orders o ON (n.data->>'orderId')::uuid = o.id
WHERE n.title IN ('Order Placed', 'Order Verified')
ORDER BY n.created_at DESC; 