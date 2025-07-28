-- Test script to verify FIFO batch logic is working correctly
-- This will show how orders are being assigned to batches

-- 1. Show current batch distribution
SELECT 
    '=== CURRENT BATCH DISTRIBUTION ===' as info;

SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    b.max_weight,
    b.status,
    b.created_at,
    COUNT(o.id) as order_count,
    STRING_AGG(o.id::text, ', ' ORDER BY o.created_at) as order_ids
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.max_weight, b.status, b.created_at
ORDER BY b.barangay, b.created_at;

-- 2. Show orders by barangay and their batch assignment
SELECT 
    '=== ORDERS BY BARANGAY ===' as info;

SELECT 
    o.id,
    o.delivery_address->>'barangay' as barangay,
    o.total_weight,
    o.batch_id,
    b.total_weight as batch_weight,
    b.max_weight as batch_max,
    o.created_at,
    b.created_at as batch_created
FROM orders o
LEFT JOIN order_batches b ON b.id = o.batch_id
WHERE o.approval_status = 'approved'
ORDER BY o.delivery_address->>'barangay', o.created_at;

-- 3. Test FIFO logic by showing the order of batch creation vs order assignment
SELECT 
    '=== FIFO VERIFICATION ===' as info;

WITH batch_order AS (
    SELECT 
        barangay,
        id as batch_id,
        created_at as batch_created,
        ROW_NUMBER() OVER (PARTITION BY barangay ORDER BY created_at) as batch_number
    FROM order_batches
    WHERE status = 'pending'
),
order_assignment AS (
    SELECT 
        o.delivery_address->>'barangay' as barangay,
        o.id as order_id,
        o.batch_id,
        o.created_at as order_created,
        ROW_NUMBER() OVER (PARTITION BY o.delivery_address->>'barangay' ORDER BY o.created_at) as order_number
    FROM orders o
    WHERE o.approval_status = 'approved' AND o.batch_id IS NOT NULL
)
SELECT 
    oa.barangay,
    oa.order_number,
    oa.order_id,
    oa.batch_id,
    bo.batch_number,
    oa.order_created,
    bo.batch_created,
    CASE 
        WHEN oa.batch_id = bo.batch_id THEN '✅ CORRECT'
        ELSE '❌ WRONG BATCH'
    END as fifo_check
FROM order_assignment oa
JOIN batch_order bo ON bo.batch_id = oa.batch_id
ORDER BY oa.barangay, oa.order_number;

-- 4. Show capacity utilization
SELECT 
    '=== CAPACITY UTILIZATION ===' as info;

SELECT 
    barangay,
    COUNT(*) as batch_count,
    SUM(total_weight) as total_weight,
    SUM(max_weight) as total_capacity,
    ROUND((SUM(total_weight) / SUM(max_weight)) * 100, 2) as utilization_percent,
    CASE 
        WHEN SUM(total_weight) >= SUM(max_weight) THEN 'FULL'
        WHEN SUM(total_weight) >= SUM(max_weight) * 0.9 THEN 'NEARLY FULL'
        ELSE 'HAS CAPACITY'
    END as status
FROM order_batches
WHERE status = 'pending'
GROUP BY barangay
ORDER BY barangay;

-- 5. Show any orders that should be batched but aren't
SELECT 
    '=== UNBATCHED ORDERS ===' as info;

SELECT 
    id,
    delivery_address->>'barangay' as barangay,
    total_weight,
    created_at
FROM orders
WHERE approval_status = 'approved' 
AND batch_id IS NULL
ORDER BY created_at; 