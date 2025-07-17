-- Simple script to add test order items
-- Run this in your Supabase SQL editor

-- Step 1: Check what orders exist in batches
SELECT 
    o.id as order_id,
    o.total,
    o.approval_status,
    o.batch_id
FROM orders o
WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NOT NULL
ORDER BY o.batch_id, o.id;

-- Step 2: Check what products are available
SELECT id, name, price FROM products LIMIT 10;

-- Step 3: Add test order items (replace the order_id and product_id with actual values from above)
-- Example: Add a product to an order
INSERT INTO order_items (order_id, product_id, quantity, price)
VALUES 
    ('your-order-id-here', 'your-product-id-here', 2, 150.00);

-- Step 4: Verify the order items were added
SELECT 
    oi.order_id,
    oi.product_id,
    oi.quantity,
    oi.price,
    p.name as product_name,
    (oi.quantity * oi.price) as subtotal
FROM order_items oi
JOIN products p ON oi.product_id = p.id
ORDER BY oi.order_id; 