-- Diagnostic check for order items issue

-- 1. Check current orders with batch_id
SELECT 'Current approved orders with batch_id:' as check_type;
SELECT 
    o.id,
    o.customer_id,
    o.total,
    o.delivery_status,
    o.batch_id,
    p.name as customer_name
FROM orders o
LEFT JOIN profiles p ON o.customer_id = p.id
WHERE o.batch_id IS NOT NULL 
AND o.approval_status = 'approved'
ORDER BY o.id;

-- 2. Check order items for these orders
SELECT 'Order items for approved orders with batch_id:' as check_type;
SELECT 
    oi.id,
    oi.order_id,
    oi.quantity,
    oi.price,
    pr.name as product_name,
    o.batch_id
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
JOIN products pr ON oi.product_id = pr.id
WHERE o.batch_id IS NOT NULL 
AND o.approval_status = 'approved'
ORDER BY oi.order_id;

-- 3. Check the specific orders we've been testing
SELECT 'Specific test orders:' as check_type;
SELECT 
    o.id,
    o.customer_id,
    o.total,
    o.delivery_status,
    o.batch_id,
    o.approval_status,
    p.name as customer_name
FROM orders o
LEFT JOIN profiles p ON o.customer_id = p.id
WHERE o.id IN (
    '076c21f0-c07f-44d4-8b09-57083808632a',  -- Aaron Tero
    '0e5b4be8-04af-4e2b-854a-08fde42cf33c'   -- BOTCHOK
);

-- 4. Check order items for these specific orders
SELECT 'Order items for specific test orders:' as check_type;
SELECT 
    oi.id,
    oi.order_id,
    oi.quantity,
    oi.price,
    pr.name as product_name
FROM order_items oi
JOIN products pr ON oi.product_id = pr.id
WHERE oi.order_id IN (
    '076c21f0-c07f-44d4-8b09-57083808632a',  -- Aaron Tero
    '0e5b4be8-04af-4e2b-854a-08fde42cf33c'   -- BOTCHOK
); 