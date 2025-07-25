-- Diagnostic script to check batch assignment issues
-- Run this in Supabase SQL editor to see what's happening

-- 1. Check all orders and their approval status
SELECT 
    id,
    approval_status,
    batch_id,
    total_weight,
    delivery_address->>'barangay' as barangay,
    created_at
FROM orders 
WHERE approval_status = 'approved'
ORDER BY created_at DESC;

-- 2. Check all batches
SELECT 
    id,
    barangay,
    total_weight,
    max_weight,
    status,
    driver_id,
    created_at,
    (SELECT COUNT(*) FROM orders WHERE batch_id = order_batches.id) as order_count
FROM order_batches
ORDER BY created_at DESC;

-- 3. Check orders that are approved but not batched
SELECT 
    id,
    approval_status,
    batch_id,
    total_weight,
    delivery_address->>'barangay' as barangay,
    created_at
FROM orders 
WHERE approval_status = 'approved' 
AND batch_id IS NULL
ORDER BY created_at DESC;

-- 4. Check if there are any orders with missing barangay
SELECT 
    id,
    approval_status,
    delivery_address,
    created_at
FROM orders 
WHERE approval_status = 'approved' 
AND (delivery_address->>'barangay' IS NULL OR delivery_address->>'barangay' = '')
ORDER BY created_at DESC;

-- 5. Check order items and their weights
SELECT 
    oi.order_id,
    oi.quantity,
    p.name as product_name,
    p.weight as product_weight,
    (oi.quantity * p.weight) as total_item_weight
FROM order_items oi
JOIN products p ON p.id = oi.product_id
JOIN orders o ON o.id = oi.order_id
WHERE o.approval_status = 'approved'
ORDER BY oi.order_id;

-- 6. Check if there are any products without weight
SELECT 
    id,
    name,
    weight
FROM products
WHERE weight IS NULL OR weight <= 0; 