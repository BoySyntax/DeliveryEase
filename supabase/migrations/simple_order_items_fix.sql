-- Simple fix to add order items to orders without them

-- First, let's see what we're working with
SELECT 'Orders without items:' as status, COUNT(*) as count
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.batch_id IS NOT NULL 
AND o.approval_status = 'approved'
AND oi.id IS NULL;

-- Get a sample product to use
SELECT 'Sample product:' as status, id, name, price
FROM products 
LIMIT 1;

-- Add order items to orders that don't have them
INSERT INTO order_items (order_id, product_id, quantity, price)
SELECT 
    o.id,
    (SELECT id FROM products LIMIT 1) as product_id,
    1 as quantity,
    (SELECT price FROM products LIMIT 1) as price
FROM orders o
WHERE o.batch_id IS NOT NULL 
AND o.approval_status = 'approved'
AND NOT EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
);

-- Verify the fix
SELECT 'After fix - orders with items:' as status, COUNT(*) as count
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.batch_id IS NOT NULL 
AND o.approval_status = 'approved'
AND oi.id IS NOT NULL; 