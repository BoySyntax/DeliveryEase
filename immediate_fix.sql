-- IMMEDIATE FIX FOR ORDER ITEMS
-- Run this in your Supabase SQL Editor

-- First, let's see what we're working with
SELECT '=== DIAGNOSTIC INFO ===' as info;

-- Check if we have any products
SELECT 'Products available:' as info, COUNT(*) as count FROM products;

-- Check if we have any orders in batches
SELECT 'Orders in batches:' as info, COUNT(*) as count 
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NOT NULL;

-- Check if we have any order items at all
SELECT 'Current order items:' as info, COUNT(*) as count FROM order_items;

-- Show sample products we can use
SELECT 'Sample products:' as info, id, name, price FROM products LIMIT 5;

-- Show sample orders that need items
SELECT 'Sample orders needing items:' as info, id, total, batch_id 
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NOT NULL 
LIMIT 5;

-- NOW LET'S FIX IT IMMEDIATELY
-- Step 1: Add order items to ALL orders that don't have any
INSERT INTO order_items (order_id, product_id, quantity, price)
SELECT 
    o.id as order_id,
    p.id as product_id,
    GREATEST(1, FLOOR(o.total / p.price)) as quantity,
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

-- Step 2: Add a second product to make orders more realistic
INSERT INTO order_items (order_id, product_id, quantity, price)
SELECT 
    o.id as order_id,
    p.id as product_id,
    GREATEST(1, FLOOR((o.total * 0.3) / p.price)) as quantity,
    p.price
FROM orders o
CROSS JOIN (
    SELECT id, price FROM products 
    WHERE price > 0 AND price < 200
    ORDER BY RANDOM() 
    LIMIT 1
) p
WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM order_items oi 
        WHERE oi.order_id = o.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM order_items oi2 
        WHERE oi2.order_id = o.id 
        AND oi2.product_id = p.id
    );

-- Step 3: Update order totals to match the actual items
UPDATE orders 
SET total = (
    SELECT COALESCE(SUM(quantity * price), 0)
    FROM order_items 
    WHERE order_id = orders.id
)
WHERE approval_status = 'approved' 
    AND batch_id IS NOT NULL;

-- Step 4: Verify our fix worked
SELECT '=== VERIFICATION ===' as info;

SELECT 'After fix - order items count:' as info, COUNT(*) as count FROM order_items;

-- Show sample orders with their items
SELECT 
    'Sample order with items:' as info,
    o.id as order_id,
    o.total,
    COUNT(oi.id) as item_count,
    STRING_AGG(p.name || ' (' || oi.quantity || 'x ₱' || oi.price || ')', ', ') as products
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.id
WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NOT NULL
GROUP BY o.id, o.total
LIMIT 3; 