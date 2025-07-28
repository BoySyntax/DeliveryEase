-- Targeted fix for the specific orders that are showing empty order_items

-- First, let's check if these orders have any items
SELECT 'Checking specific orders:' as status;
SELECT 
    o.id,
    o.customer_id,
    o.total,
    o.delivery_status,
    COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.id IN (
    '076c21f0-c07f-44d4-8b09-57083808632a',  -- Aaron Tero
    '0e5b4be8-04af-4e2b-854a-08fde42cf33c'   -- BOTCHOK
)
GROUP BY o.id, o.customer_id, o.total, o.delivery_status;

-- Get available products
SELECT 'Available products:' as status;
SELECT id, name, price FROM products LIMIT 5;

-- Add order items to Aaron Tero's order
INSERT INTO order_items (order_id, product_id, quantity, price)
SELECT 
    '076c21f0-c07f-44d4-8b09-57083808632a' as order_id,
    p.id as product_id,
    2 as quantity,
    p.price
FROM products p
LIMIT 1;

-- Add order items to BOTCHOK's order  
INSERT INTO order_items (order_id, product_id, quantity, price)
SELECT 
    '0e5b4be8-04af-4e2b-854a-08fde42cf33c' as order_id,
    p.id as product_id,
    1 as quantity,
    p.price
FROM products p
LIMIT 1;

-- Verify the fix worked
SELECT 'After fix - order items:' as status;
SELECT 
    o.id,
    o.customer_id,
    o.total,
    o.delivery_status,
    COUNT(oi.id) as item_count,
    STRING_AGG(p.name || ' (x' || oi.quantity || ')', ', ') as items
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.id
WHERE o.id IN (
    '076c21f0-c07f-44d4-8b09-57083808632a',  -- Aaron Tero
    '0e5b4be8-04af-4e2b-854a-08fde42cf33c'   -- BOTCHOK
)
GROUP BY o.id, o.customer_id, o.total, o.delivery_status; 