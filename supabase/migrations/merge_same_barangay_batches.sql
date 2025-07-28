-- Direct fix to merge batches from the same barangay
-- This will combine Batch 1 and Batch 2 for Carmen into one batch

-- 1. First, let's see the current situation
SELECT 
    '=== CURRENT BATCHES ===' as info;

SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    b.status,
    b.created_at,
    COUNT(o.id) as order_count,
    STRING_AGG(o.id::text, ', ' ORDER BY o.created_at) as order_ids
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.status, b.created_at
ORDER BY b.barangay, b.created_at;

-- 2. Show orders that need to be moved
SELECT 
    '=== ORDERS TO BE MOVED ===' as info;

SELECT 
    o.id,
    o.batch_id,
    o.total_weight,
    o.delivery_address->>'barangay' as barangay,
    b.barangay as batch_barangay,
    b.total_weight as batch_weight
FROM orders o
JOIN order_batches b ON b.id = o.batch_id
WHERE o.approval_status = 'approved'
ORDER BY o.created_at;

-- 3. DIRECT FIX: Merge batches for the same barangay
DO $$
DECLARE
    barangay_record RECORD;
    target_batch_id uuid;
    source_batch RECORD;
    combined_weight decimal;
BEGIN
    -- For each barangay with multiple batches, consolidate them
    FOR barangay_record IN
        SELECT barangay
        FROM order_batches
        WHERE status = 'pending'
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        RAISE NOTICE 'Processing barangay: %', barangay_record.barangay;
        
        -- Get the oldest batch as the target
        SELECT id INTO target_batch_id
        FROM order_batches
        WHERE status = 'pending'
        AND barangay = barangay_record.barangay
        ORDER BY created_at ASC
        LIMIT 1;
        
        RAISE NOTICE 'Target batch: %', target_batch_id;
        
        -- Move ALL orders from other batches to the target batch
        FOR source_batch IN
            SELECT id, total_weight
            FROM order_batches
            WHERE status = 'pending'
            AND barangay = barangay_record.barangay
            AND id != target_batch_id
            ORDER BY created_at ASC
        LOOP
            RAISE NOTICE 'Moving orders from batch % to batch %', source_batch.id, target_batch_id;
            
            -- Move orders from source batch to target batch
            UPDATE orders
            SET batch_id = target_batch_id
            WHERE batch_id = source_batch.id;
            
            -- Delete the empty source batch
            DELETE FROM order_batches WHERE id = source_batch.id;
        END LOOP;
    END LOOP;
END $$;

-- 4. Update batch total weights to reflect actual order weights
UPDATE order_batches 
SET total_weight = (
    SELECT COALESCE(SUM(o.total_weight), 0)
    FROM orders o
    WHERE o.batch_id = order_batches.id
    AND o.approval_status = 'approved'
)
WHERE id IN (
    SELECT DISTINCT batch_id 
    FROM orders 
    WHERE batch_id IS NOT NULL
);

-- 5. Show the results after merging
SELECT 
    '=== BATCHES AFTER MERGING ===' as info;

SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    b.status,
    b.created_at,
    COUNT(o.id) as order_count,
    STRING_AGG(o.id::text, ', ' ORDER BY o.created_at) as order_ids
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.status, b.created_at
ORDER BY b.barangay, b.created_at;

-- 6. Show final batch distribution by barangay
SELECT 
    '=== FINAL BATCH DISTRIBUTION ===' as info;

SELECT 
    barangay,
    COUNT(*) as batch_count,
    SUM(total_weight) as total_weight,
    AVG(total_weight) as avg_weight,
    MIN(created_at) as oldest_batch,
    MAX(created_at) as newest_batch,
    CASE 
        WHEN COUNT(*) = 1 THEN '✅ PERFECT - One batch per barangay'
        WHEN COUNT(*) > 1 THEN '⚠️ MULTIPLE - Barangay has multiple batches (check if needed)'
        ELSE '❌ No batches'
    END as status
FROM order_batches
WHERE status = 'pending'
GROUP BY barangay
ORDER BY barangay;

-- 7. Show individual orders and their batch assignment
SELECT 
    '=== ORDERS AND THEIR BATCHES ===' as info;

SELECT 
    o.id,
    o.delivery_address->>'barangay' as barangay,
    o.total_weight,
    o.batch_id,
    b.barangay as batch_barangay,
    b.total_weight as batch_weight,
    o.created_at
FROM orders o
LEFT JOIN order_batches b ON b.id = o.batch_id
WHERE o.approval_status = 'approved'
ORDER BY o.delivery_address->>'barangay', o.created_at;

-- 8. Final summary
SELECT 
    '=== FINAL SUMMARY ===' as info;

SELECT 
    'Total batches' as metric,
    COUNT(*) as value
FROM order_batches

UNION ALL

SELECT 
    'Batches with orders' as metric,
    COUNT(*) as value
FROM order_batches b
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.batch_id = b.id)

UNION ALL

SELECT 
    'Barangays with batches' as metric,
    COUNT(DISTINCT barangay) as value
FROM order_batches

UNION ALL

SELECT 
    'Approved orders' as metric,
    COUNT(*) as value
FROM orders 
WHERE approval_status = 'approved'

UNION ALL

SELECT 
    'Approved orders with batch' as metric,
    COUNT(*) as value
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NOT NULL; 