-- Check if order_items table has any data
SELECT COUNT(*) as total_order_items FROM order_items;

-- Check the structure of order_items table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'order_items';

-- Check if there are any orders without order_items
SELECT 
    o.id as order_id,
    o.total,
    o.approval_status,
    o.batch_id,
    COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NOT NULL
GROUP BY o.id, o.total, o.approval_status, o.batch_id
HAVING COUNT(oi.id) = 0;

-- Check what orders exist in batches
SELECT 
    ob.id as batch_id,
    ob.status as batch_status,
    o.id as order_id,
    o.total,
    o.approval_status,
    COUNT(oi.id) as item_count
FROM order_batches ob
JOIN orders o ON o.batch_id = ob.id
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE ob.status IN ('assigned', 'delivering')
GROUP BY ob.id, ob.status, o.id, o.total, o.approval_status
ORDER BY ob.id, o.id;

-- Check if there are any products available
SELECT COUNT(*) as total_products FROM products;

-- Sample of products that could be used
SELECT id, name, price FROM products LIMIT 5;

-- Check if there are any cart_items that could be converted to order_items
SELECT 
    ci.cart_id,
    ci.product_id,
    ci.quantity,
    p.name as product_name,
    p.price
FROM cart_items ci
JOIN products p ON ci.product_id = p.id
LIMIT 10; 