-- Manual fix for duplicate Patag batches
-- Run this script directly in your database to immediately consolidate same-barangay batches

-- First, let's see the current situation
SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    b.max_weight,
    b.status,
    ROUND((b.total_weight / b.max_weight * 100)::numeric, 1) as capacity_percent,
    COUNT(o.id) as order_count
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.max_weight, b.status
ORDER BY b.barangay, b.created_at;

-- Find duplicate barangays
SELECT 
    barangay, 
    COUNT(*) as batch_count,
    SUM(total_weight) as combined_weight,
    STRING_AGG(id::text, ', ') as batch_ids
FROM order_batches 
WHERE status = 'pending'
GROUP BY barangay
HAVING COUNT(*) > 1;

-- For Patag specifically - consolidate into the earliest batch
DO $$
DECLARE
    target_batch_id uuid;
    source_batch_id uuid;
    target_weight decimal;
    source_weight decimal;
    combined_weight decimal;
BEGIN
    -- Get the two Patag batches (earliest first)
    SELECT id, total_weight INTO target_batch_id, target_weight
    FROM order_batches 
    WHERE barangay = 'Patag' AND status = 'pending'
    ORDER BY created_at ASC 
    LIMIT 1;
    
    SELECT id, total_weight INTO source_batch_id, source_weight
    FROM order_batches 
    WHERE barangay = 'Patag' AND status = 'pending' AND id != target_batch_id
    ORDER BY created_at ASC 
    LIMIT 1;
    
    IF target_batch_id IS NOT NULL AND source_batch_id IS NOT NULL THEN
        combined_weight := target_weight + source_weight;
        
        -- Check if combined weight exceeds capacity
        IF combined_weight <= 3500 THEN
            RAISE NOTICE '🔄 Consolidating Patag batches: % (% kg) + % (% kg) = % kg', 
                target_batch_id, target_weight, source_batch_id, source_weight, combined_weight;
            
            -- Move orders from source to target batch
            UPDATE orders 
            SET batch_id = target_batch_id 
            WHERE batch_id = source_batch_id;
            
            -- Update target batch weight
            UPDATE order_batches 
            SET total_weight = combined_weight
            WHERE id = target_batch_id;
            
            -- Delete the empty source batch
            DELETE FROM order_batches WHERE id = source_batch_id;
            
            RAISE NOTICE '✅ Successfully consolidated Patag batches!';
        ELSE
            RAISE NOTICE '❌ Cannot consolidate - combined weight % kg exceeds 3500kg limit', combined_weight;
        END IF;
    ELSE
        RAISE NOTICE 'ℹ️ No duplicate Patag batches found to consolidate';
    END IF;
END $$;

-- Verify the fix
SELECT 
    'After consolidation:' as status,
    b.id,
    b.barangay,
    b.total_weight,
    b.max_weight,
    ROUND((b.total_weight / b.max_weight * 100)::numeric, 1) as capacity_percent,
    COUNT(o.id) as order_count
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.status = 'pending' AND b.barangay = 'Patag'
GROUP BY b.id, b.barangay, b.total_weight, b.max_weight
ORDER BY b.created_at;

-- Check for any remaining duplicate barangays
SELECT 
    'Remaining duplicates:' as status,
    barangay, 
    COUNT(*) as batch_count
FROM order_batches 
WHERE status = 'pending'
GROUP BY barangay
HAVING COUNT(*) > 1; 