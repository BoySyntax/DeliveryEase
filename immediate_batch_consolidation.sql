-- IMMEDIATE BATCH CONSOLIDATION FIX
-- Run this directly in your Supabase SQL editor to fix the duplicate Carmen batches

-- Step 1: Show current status
SELECT 'CURRENT STATUS' as info;
SELECT barangay, COUNT(*) as batches, SUM(total_weight) as total_weight
FROM order_batches 
WHERE status = 'pending'
GROUP BY barangay;

-- Step 2: Consolidate duplicate Carmen batches
DO $$
DECLARE
    target_batch_id UUID;
    source_batch_id UUID;
    total_consolidated_weight DECIMAL := 0;
BEGIN
    RAISE NOTICE 'Starting Carmen batch consolidation...';
    
    -- Get the oldest Carmen batch as target
    SELECT id, total_weight INTO target_batch_id, total_consolidated_weight
    FROM order_batches
    WHERE barangay = 'Carmen' AND status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF target_batch_id IS NOT NULL THEN
        RAISE NOTICE 'Target batch: % (current weight: %kg)', target_batch_id, total_consolidated_weight;
        
        -- Move orders from newer Carmen batches to the oldest one
        FOR source_batch_id IN
            SELECT id
            FROM order_batches
            WHERE barangay = 'Carmen' 
            AND status = 'pending' 
            AND id != target_batch_id
            ORDER BY created_at ASC
        LOOP
            RAISE NOTICE 'Moving orders from batch % to target batch %', source_batch_id, target_batch_id;
            
            -- Move orders
            UPDATE orders 
            SET batch_id = target_batch_id 
            WHERE batch_id = source_batch_id;
            
            -- Delete the empty source batch
            DELETE FROM order_batches WHERE id = source_batch_id;
        END LOOP;
        
        -- Update target batch weight
        UPDATE order_batches 
        SET total_weight = (
            SELECT COALESCE(SUM(o.total_weight), 0)
            FROM orders o
            WHERE o.batch_id = target_batch_id
        )
        WHERE id = target_batch_id;
        
        RAISE NOTICE 'Consolidation complete!';
    END IF;
END $$;

-- Step 3: Show final status
SELECT 'FINAL STATUS' as info;
SELECT barangay, COUNT(*) as batches, SUM(total_weight) as total_weight
FROM order_batches 
WHERE status = 'pending'
GROUP BY barangay;

-- Step 4: Verify the fix
SELECT 'VERIFICATION' as info;
SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    COUNT(o.id) as order_count
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight
ORDER BY b.barangay, b.created_at; 