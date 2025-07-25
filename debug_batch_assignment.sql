-- Debug script to understand why new batches are being created when existing ones aren't full

-- 1. Check current batch state
SELECT '=== CURRENT BATCH STATE ===' as info;

SELECT 
    'All batches:' as status,
    id,
    barangay,
    total_weight,
    max_weight,
    status,
    created_at,
    (SELECT COUNT(*) FROM orders WHERE batch_id = order_batches.id) as order_count
FROM order_batches
ORDER BY barangay, created_at;

-- 2. Check orders and their weights
SELECT '=== ORDER WEIGHTS ===' as info;

SELECT 
    'Orders with batch assignments:' as status,
    o.id,
    o.approval_status,
    o.batch_id,
    o.total_weight as order_total_weight,
    o.delivery_address->>'barangay' as barangay,
    (SELECT SUM(oi.quantity * p.weight) 
     FROM order_items oi 
     JOIN products p ON p.id = oi.product_id 
     WHERE oi.order_id = o.id) as calculated_weight
FROM orders o
WHERE o.approval_status = 'approved'
ORDER BY o.batch_id, o.created_at;

-- 3. Check if there are orders without batch_id
SELECT '=== ORDERS WITHOUT BATCH ===' as info;

SELECT 
    'Approved orders without batch:' as status,
    o.id,
    o.approval_status,
    o.batch_id,
    o.total_weight as order_total_weight,
    o.delivery_address->>'barangay' as barangay,
    (SELECT SUM(oi.quantity * p.weight) 
     FROM order_items oi 
     JOIN products p ON p.id = oi.product_id 
     WHERE oi.order_id = o.id) as calculated_weight
FROM orders o
WHERE o.approval_status = 'approved' 
AND o.batch_id IS NULL
ORDER BY o.created_at;

-- 4. Check batch capacity analysis
SELECT '=== BATCH CAPACITY ANALYSIS ===' as info;

WITH batch_analysis AS (
    SELECT 
        b.id as batch_id,
        b.barangay,
        b.total_weight as batch_total_weight,
        b.max_weight,
        b.status,
        COUNT(o.id) as order_count,
        SUM(o.total_weight) as orders_total_weight,
        (SELECT SUM(oi.quantity * p.weight) 
         FROM orders o2 
         JOIN order_items oi ON oi.order_id = o2.id 
         JOIN products p ON p.id = oi.product_id 
         WHERE o2.batch_id = b.id) as calculated_total_weight
    FROM order_batches b
    LEFT JOIN orders o ON o.batch_id = b.id
    WHERE b.status = 'pending'
    GROUP BY b.id, b.barangay, b.total_weight, b.max_weight, b.status
)
SELECT 
    'Batch capacity details:' as status,
    batch_id,
    barangay,
    batch_total_weight,
    max_weight,
    order_count,
    orders_total_weight,
    calculated_total_weight,
    (max_weight - batch_total_weight) as remaining_capacity,
    (max_weight - calculated_total_weight) as actual_remaining_capacity
FROM batch_analysis
ORDER BY barangay, batch_id;

-- 5. Check if there are weight discrepancies
SELECT '=== WEIGHT DISCREPANCIES ===' as info;

SELECT 
    'Orders with weight discrepancies:' as status,
    o.id,
    o.total_weight as stored_weight,
    (SELECT SUM(oi.quantity * p.weight) 
     FROM order_items oi 
     JOIN products p ON p.id = oi.product_id 
     WHERE oi.order_id = o.id) as calculated_weight,
    ABS(o.total_weight - (SELECT SUM(oi.quantity * p.weight) 
                         FROM order_items oi 
                         JOIN products p ON p.id = oi.product_id 
                         WHERE oi.order_id = o.id)) as difference
FROM orders o
WHERE o.approval_status = 'approved'
AND ABS(o.total_weight - (SELECT SUM(oi.quantity * p.weight) 
                         FROM order_items oi 
                         JOIN products p ON p.id = oi.product_id 
                         WHERE oi.order_id = o.id)) > 0.01
ORDER BY difference DESC;

-- 6. Test the batch assignment logic for a specific barangay
SELECT '=== BATCH ASSIGNMENT LOGIC TEST ===' as info;

-- Let's test with a specific barangay that has multiple batches
WITH barangay_batches AS (
    SELECT barangay, COUNT(*) as batch_count
    FROM order_batches
    WHERE status = 'pending'
    GROUP BY barangay
    HAVING COUNT(*) > 1
    LIMIT 1
)
SELECT 
    'Testing batch assignment for barangay:' as status,
    bb.barangay,
    bb.batch_count
FROM barangay_batches bb;

-- Show what the batch assignment logic would find for this barangay
WITH test_barangay AS (
    SELECT DISTINCT barangay 
    FROM order_batches 
    WHERE status = 'pending' 
    GROUP BY barangay 
    HAVING COUNT(*) > 1 
    LIMIT 1
),
test_order AS (
    SELECT 
        o.id,
        o.total_weight,
        o.delivery_address->>'barangay' as barangay
    FROM orders o
    WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NULL
    AND o.delivery_address->>'barangay' = (SELECT barangay FROM test_barangay)
    LIMIT 1
)
SELECT 
    'Batch assignment test for order:' as status,
    to.id as order_id,
    to.total_weight as order_weight,
    to.barangay,
    b.id as batch_id,
    b.total_weight as batch_weight,
    b.max_weight,
    (b.total_weight + to.total_weight) as combined_weight,
    (b.max_weight - b.total_weight) as remaining_capacity,
    CASE 
        WHEN (b.total_weight + to.total_weight) <= b.max_weight THEN 'CAN FIT'
        ELSE 'CANNOT FIT'
    END as can_fit
FROM test_order to
CROSS JOIN order_batches b
WHERE b.status = 'pending'
AND b.barangay = to.barangay
ORDER BY (b.max_weight - b.total_weight) DESC, b.created_at ASC; 