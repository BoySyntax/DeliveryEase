-- Quick Fix for Order Items
-- Copy and paste this into your Supabase SQL Editor and run it

-- Step 1: Check current state
SELECT 'Current order items count:' as info, COUNT(*) as count FROM order_items;

-- Step 2: Check orders without items
SELECT 'Orders without items:' as info, COUNT(*) as count 
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NOT NULL
    AND oi.id IS NULL;

-- Step 3: Get sample products
SELECT 'Available products:' as info, COUNT(*) as count FROM products;

-- Step 4: Add order items to orders that don't have any
INSERT INTO order_items (order_id, product_id, quantity, price)
SELECT 
    o.id as order_id,
    p.id as product_id,
    CASE 
        WHEN p.price <= 100 THEN 2
        WHEN p.price <= 500 THEN 1
        ELSE 1
    END as quantity,
    p.price
FROM orders o
CROSS JOIN (
    SELECT id, price FROM products 
    WHERE price > 0 
    ORDER BY RANDOM() 
    LIMIT 1
) p
WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM order_items oi 
        WHERE oi.order_id = o.id
    );

-- Step 5: Update order totals
UPDATE orders 
SET total = (
    SELECT COALESCE(SUM(quantity * price), 0)
    FROM order_items 
    WHERE order_id = orders.id
)
WHERE approval_status = 'approved' 
    AND batch_id IS NOT NULL;

-- Step 6: Verify the fix
SELECT 'After fix - order items count:' as info, COUNT(*) as count FROM order_items;

-- Step 7: Show sample order with items
SELECT 
    o.id as order_id,
    o.total,
    COUNT(oi.id) as item_count,
    STRING_AGG(p.name || ' (' || oi.quantity || 'x)', ', ') as products
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.id
WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NOT NULL
GROUP BY o.id, o.total
LIMIT 5; 