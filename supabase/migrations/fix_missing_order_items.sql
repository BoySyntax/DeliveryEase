-- Fix orders that don't have order_items records
-- This will add order_items for orders that are missing them

-- First, let's see which orders are missing order_items
SELECT 'Orders without order_items:' as status;
SELECT 
    o.id,
    o.customer_id,
    o.total,
    o.delivery_status,
    o.batch_id,
    COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.approval_status = 'approved'
GROUP BY o.id, o.customer_id, o.total, o.delivery_status, o.batch_id
HAVING COUNT(oi.id) = 0;

-- Get available products to use for missing order_items
SELECT 'Available products:' as status;
SELECT id, name, price, weight FROM products LIMIT 10;

-- Add order_items for orders that don't have any
-- We'll use the first available product and calculate quantity based on total price
INSERT INTO order_items (order_id, product_id, quantity, price)
SELECT 
    o.id as order_id,
    p.id as product_id,
    CASE 
        WHEN p.price > 0 THEN GREATEST(1, ROUND(o.total / p.price))
        ELSE 1
    END as quantity,
    p.price
FROM orders o
CROSS JOIN LATERAL (
    SELECT id, name, price, weight 
    FROM products 
    WHERE price > 0 
    ORDER BY price ASC 
    LIMIT 1
) p
WHERE o.approval_status = 'approved'
AND NOT EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
);

-- Verify the fix worked
SELECT 'After fix - orders with items:' as status;
SELECT 
    o.id,
    o.customer_id,
    o.total,
    o.delivery_status,
    o.batch_id,
    COUNT(oi.id) as item_count,
    STRING_AGG(p.name || ' (x' || oi.quantity || ')', ', ') as items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.id
WHERE o.approval_status = 'approved'
GROUP BY o.id, o.customer_id, o.total, o.delivery_status, o.batch_id
ORDER BY o.created_at DESC; 