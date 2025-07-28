-- Batch System Verification Script
-- This script verifies that the barangay-based batching system with 3500kg limit is working correctly

-- 1. Check current batch system configuration
SELECT 
    'Current Batch Configuration' as check_type,
    COUNT(*) as total_batches,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_batches,
    COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned_batches,
    AVG(total_weight) as avg_weight,
    MAX(total_weight) as max_weight_found,
    COUNT(DISTINCT barangay) as unique_barangays
FROM order_batches;

-- 2. Show current batches with their details
SELECT 
    'Current Batches Overview' as section,
    id,
    barangay,
    status,
    total_weight,
    max_weight,
    ROUND((total_weight::numeric / max_weight::numeric) * 100, 2) as capacity_percentage,
    created_at
FROM order_batches
ORDER BY barangay, created_at;

-- 3. Verify batch assignment logic is working
SELECT 
    'Batch Assignment Verification' as section,
    b.barangay,
    b.id as batch_id,
    b.total_weight as batch_weight,
    b.max_weight,
    COUNT(o.id) as orders_in_batch,
    ARRAY_AGG(o.id) as order_ids,
    ARRAY_AGG(o.total_weight) as order_weights
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.max_weight
ORDER BY b.barangay, b.created_at;

-- 4. Check for orders that should be batched but aren't
SELECT 
    'Unbatched Approved Orders' as section,
    id,
    delivery_address->>'barangay' as barangay,
    total_weight,
    approval_status,
    batch_id,
    created_at
FROM orders 
WHERE approval_status = 'approved' 
AND batch_id IS NULL
ORDER BY created_at DESC;

-- 5. Verify weight calculation accuracy
SELECT 
    'Weight Calculation Verification' as section,
    o.id as order_id,
    o.total_weight as stored_weight,
    COALESCE(SUM(oi.quantity * p.weight), 0) as calculated_weight,
    CASE 
        WHEN ABS(o.total_weight - COALESCE(SUM(oi.quantity * p.weight), 0)) < 0.01 
        THEN 'CORRECT' 
        ELSE 'MISMATCH' 
    END as weight_status
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN products p ON p.id = oi.product_id
WHERE o.approval_status = 'approved'
GROUP BY o.id, o.total_weight
HAVING COUNT(oi.id) > 0
ORDER BY weight_status DESC, o.created_at DESC
LIMIT 10;

-- 6. Show batch capacity analysis
SELECT 
    'Batch Capacity Analysis' as section,
    barangay,
    COUNT(*) as total_batches,
    SUM(total_weight) as total_weight_all_batches,
    AVG(total_weight) as avg_weight_per_batch,
    MAX(total_weight) as heaviest_batch,
    MIN(total_weight) as lightest_batch,
    COUNT(CASE WHEN total_weight >= max_weight THEN 1 END) as full_batches,
    COUNT(CASE WHEN total_weight < max_weight THEN 1 END) as partial_batches
FROM order_batches
WHERE status = 'pending'
GROUP BY barangay
ORDER BY total_weight_all_batches DESC;

-- 7. Check trigger function exists and is properly configured
SELECT 
    'Trigger Configuration' as section,
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'batch_orders_trigger'
AND event_object_table = 'orders';

-- 8. Test batch assignment logic (simulation)
WITH test_order AS (
    SELECT 
        'Test Order Simulation' as section,
        'Barangay ABC' as test_barangay,
        150.5 as test_weight
),
suitable_batches AS (
    SELECT 
        b.id,
        b.barangay,
        b.total_weight,
        b.max_weight,
        (b.max_weight - b.total_weight) as remaining_capacity,
        CASE 
            WHEN b.total_weight + 150.5 <= b.max_weight 
            THEN 'CAN_FIT' 
            ELSE 'TOO_HEAVY' 
        END as fit_status
    FROM order_batches b
    WHERE b.status = 'pending' 
    AND b.barangay = 'Barangay ABC'
    ORDER BY b.created_at ASC
)
SELECT * FROM test_order
UNION ALL
SELECT 
    'Available Batches for Test' as section,
    CONCAT('Batch: ', id) as test_barangay,
    remaining_capacity as test_weight
FROM suitable_batches;

-- 9. Summary report
SELECT 
    'SYSTEM SUMMARY' as section,
    'Batch System Status: ' || 
    CASE 
        WHEN EXISTS (SELECT 1 FROM order_batches WHERE max_weight = 3500) 
        THEN 'ACTIVE with 3500kg limit' 
        ELSE 'NOT CONFIGURED' 
    END as test_barangay,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE trigger_name = 'batch_orders_trigger'
        ) 
        THEN 'TRIGGERS ACTIVE' 
        ELSE 'TRIGGERS MISSING' 
    END as test_weight;

-- Output success message
SELECT 
    '✅ VERIFICATION COMPLETE' as result,
    'Barangay-based batching with 3500kg limit is' as status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM order_batches WHERE max_weight = 3500)
        AND EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'batch_orders_trigger')
        THEN 'FULLY OPERATIONAL! 🚚📦'
        ELSE 'NEEDS ATTENTION ⚠️'
    END as system_status; 