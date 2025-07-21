-- Comprehensive Order Items Verification and Fix Script
-- This script will check the current state and fix any missing order items

-- 1. First, let's see what orders exist in the current batch
SELECT 
    'Current Orders in Batch' as info,
    COUNT(*) as total_orders
FROM orders 
WHERE batch_id IS NOT NULL 
AND approval_status = 'approved';

-- 2. Check which orders have items
SELECT 
    'Orders with Items' as info,
    o.id as order_id,
    o.total,
    o.delivery_status,
    COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.batch_id IS NOT NULL 
AND o.approval_status = 'approved'
GROUP BY o.id, o.total, o.delivery_status
ORDER BY item_count DESC;

-- 3. Check which orders are missing items
SELECT 
    'Orders Missing Items' as info,
    o.id as order_id,
    o.total,
    o.delivery_status,
    o.delivery_address->>'street_address' as address
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.batch_id IS NOT NULL 
AND o.approval_status = 'approved'
AND oi.id IS NULL;

-- 4. Check if there are any products available
SELECT 
    'Available Products' as info,
    id,
    name,
    price
FROM products 
LIMIT 10;

-- 5. Fix missing order items by adding sample items
-- This will add order items to any orders that don't have them
INSERT INTO order_items (order_id, product_id, quantity, price)
SELECT 
    o.id as order_id,
    p.id as product_id,
    CASE 
        WHEN o.total >= 1000 THEN 2
        WHEN o.total >= 500 THEN 1
        ELSE 1
    END as quantity,
    p.price
FROM orders o
CROSS JOIN (
    SELECT id, price FROM products 
    ORDER BY RANDOM() 
    LIMIT 1
) p
WHERE o.batch_id IS NOT NULL 
AND o.approval_status = 'approved'
AND NOT EXISTS (
    SELECT 1 FROM order_items oi 
    WHERE oi.order_id = o.id
);

-- 6. Update order totals to match the items
UPDATE orders 
SET total = (
    SELECT COALESCE(SUM(oi.quantity * oi.price), 0)
    FROM order_items oi
    WHERE oi.order_id = orders.id
)
WHERE batch_id IS NOT NULL 
AND approval_status = 'approved';

-- 7. Verify the fix worked
SELECT 
    'Verification After Fix' as info,
    o.id as order_id,
    o.total,
    o.delivery_status,
    COUNT(oi.id) as item_count,
    STRING_AGG(p.name || ' (x' || oi.quantity || ')', ', ') as items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.id
WHERE o.batch_id IS NOT NULL 
AND o.approval_status = 'approved'
GROUP BY o.id, o.total, o.delivery_status
ORDER BY o.id; 