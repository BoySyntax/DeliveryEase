-- Fix for unique constraint issue with duplicate barangay batches
-- This will consolidate duplicate batches before applying constraints

-- First, let's see what we have
SELECT 'Current batches before consolidation:' as info;
SELECT 
    b.id as batch_id,
    b.barangay,
    b.total_weight as batch_total_weight,
    b.status,
    COUNT(o.id) as order_count,
    SUM(o.total_weight) as actual_order_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.status
ORDER BY b.created_at;

-- Drop the problematic constraint if it exists
ALTER TABLE order_batches 
DROP CONSTRAINT IF EXISTS unique_pending_batch_per_barangay;

-- Function to consolidate duplicate batches for the same barangay
CREATE OR REPLACE FUNCTION consolidate_duplicate_barangay_batches()
RETURNS TEXT AS $$
DECLARE
    barangay_record RECORD;
    target_batch_id uuid;
    source_batch_id uuid;
    target_batch_weight decimal;
    source_batch_weight decimal;
    consolidated_count INTEGER := 0;
    max_weight_limit decimal := 3500;
BEGIN
    -- For each barangay that has multiple pending batches
    FOR barangay_record IN 
        SELECT barangay, COUNT(*) as batch_count
        FROM order_batches 
        WHERE status = 'pending'
        AND barangay IS NOT NULL
        AND barangay != ''
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        -- Find the oldest batch for this barangay to use as the target
        SELECT id, total_weight INTO target_batch_id, target_batch_weight
        FROM order_batches 
        WHERE status = 'pending' 
        AND LOWER(barangay) = LOWER(barangay_record.barangay)
        ORDER BY created_at ASC
        LIMIT 1;
        
        -- Try to merge other batches into the target batch
        FOR source_batch_id, source_batch_weight IN 
            SELECT id, total_weight
            FROM order_batches 
            WHERE status = 'pending'
            AND LOWER(barangay) = LOWER(barangay_record.barangay)
            AND id != target_batch_id
        LOOP
            -- Check if we can merge these batches
            IF (target_batch_weight + source_batch_weight) <= max_weight_limit THEN
                -- Move all orders from source to target
                UPDATE orders 
                SET batch_id = target_batch_id
                WHERE batch_id = source_batch_id;
                
                -- Update target batch weight
                UPDATE order_batches 
                SET total_weight = target_batch_weight + source_batch_weight
                WHERE id = target_batch_id;
                
                -- Delete the source batch
                DELETE FROM order_batches 
                WHERE id = source_batch_id;
                
                -- Update our tracking variables
                target_batch_weight := target_batch_weight + source_batch_weight;
                consolidated_count := consolidated_count + 1;
            END IF;
        END LOOP;
    END LOOP;
    
    IF consolidated_count > 0 THEN
        RETURN format('Consolidated %s duplicate batches', consolidated_count);
    ELSE
        RETURN 'No duplicate batches found';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up empty and invalid batches
CREATE OR REPLACE FUNCTION cleanup_invalid_batches()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete batches that are empty, have no barangay, or have 0 weight
    DELETE FROM order_batches 
    WHERE status = 'pending'
    AND (
        total_weight = 0 
        OR barangay IS NULL 
        OR barangay = ''
        OR id NOT IN (
            SELECT DISTINCT batch_id 
            FROM orders 
            WHERE batch_id IS NOT NULL
        )
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to recalculate batch weights
CREATE OR REPLACE FUNCTION recalculate_batch_weights()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    actual_weight decimal;
    updated_count INTEGER := 0;
BEGIN
    -- For each batch, recalculate the total weight from actual orders
    FOR batch_record IN 
        SELECT b.id, b.barangay
        FROM order_batches b
        WHERE b.status = 'pending'
    LOOP
        -- Calculate actual weight from orders in this batch
        SELECT COALESCE(SUM(o.total_weight), 0)
        INTO actual_weight
        FROM orders o
        WHERE o.batch_id = batch_record.id
        AND o.approval_status = 'approved';
        
        -- Update batch weight to match actual order weight
        UPDATE order_batches 
        SET total_weight = actual_weight
        WHERE id = batch_record.id;
        
        updated_count := updated_count + 1;
    END LOOP;
    
    IF updated_count > 0 THEN
        RETURN format('Updated weights for %s batches', updated_count);
    ELSE
        RETURN 'No batches needed weight updates';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Run the consolidation and cleanup
SELECT consolidate_duplicate_barangay_batches();
SELECT cleanup_invalid_batches();
SELECT recalculate_batch_weights();

-- Show the results after consolidation
SELECT 'After consolidation - batches:' as info;
SELECT 
    b.id as batch_id,
    b.barangay,
    b.total_weight as batch_total_weight,
    b.status,
    COUNT(o.id) as order_count,
    SUM(o.total_weight) as actual_order_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.status
ORDER BY b.created_at;

-- Now we can safely create the unique constraint (optional)
-- Uncomment the line below if you want to prevent future duplicates
-- ALTER TABLE order_batches ADD CONSTRAINT unique_pending_batch_per_barangay UNIQUE (barangay, status) WHERE status = 'pending';

-- Show final status
SELECT 'Unique constraint issue fixed - duplicate batches consolidated!' as status; 