-- Check batch assignment issues
-- Run this to see what's happening with your batches

-- 1. Check all approved orders and their batch status
SELECT 
    '=== APPROVED ORDERS ===' as info;

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
    '=== ALL BATCHES ===' as info;

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
    '=== APPROVED ORDERS WITHOUT BATCH ===' as info;

SELECT 
    id,
    approval_status,
    batch_id,
    total_weight,
    delivery_address->>'barangay' as barangay,
    delivery_address,
    created_at
FROM orders 
WHERE approval_status = 'approved' 
AND batch_id IS NULL
ORDER BY created_at DESC;

-- 4. Check if there are any orders with missing barangay
SELECT 
    '=== ORDERS WITH MISSING BARANGAY ===' as info;

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
    '=== ORDER ITEMS AND WEIGHTS ===' as info;

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
    '=== PRODUCTS WITHOUT WEIGHT ===' as info;

SELECT 
    id,
    name,
    weight
FROM products
WHERE weight IS NULL OR weight <= 0;

-- 7. Summary statistics
SELECT 
    '=== SUMMARY ===' as info;

SELECT 
    'Total approved orders' as metric,
    COUNT(*) as value
FROM orders 
WHERE approval_status = 'approved'

UNION ALL

SELECT 
    'Approved orders with batch' as metric,
    COUNT(*) as value
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NOT NULL

UNION ALL

SELECT 
    'Approved orders without batch' as metric,
    COUNT(*) as value
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NULL

UNION ALL

SELECT 
    'Total batches' as metric,
    COUNT(*) as value
FROM order_batches

UNION ALL

SELECT 
    'Orders with missing barangay' as metric,
    COUNT(*) as value
FROM orders 
WHERE approval_status = 'approved' 
AND (delivery_address->>'barangay' IS NULL OR delivery_address->>'barangay' = ''); 