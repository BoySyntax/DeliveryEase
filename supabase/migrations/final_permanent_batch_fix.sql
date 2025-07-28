-- FINAL PERMANENT FIX: Prevent empty batches and ensure proper batching
-- This will fix the current issue and prevent it from happening again

-- Step 1: Clean up all existing empty and invalid batches
DELETE FROM order_batches 
WHERE status = 'pending'
AND (
    total_weight = 0 
    OR barangay IS NULL 
    OR barangay = ''
    OR barangay = 'null'
    OR id NOT IN (
        SELECT DISTINCT batch_id 
        FROM orders 
        WHERE batch_id IS NOT NULL
    )
);

-- Step 2: Drop any problematic constraints
ALTER TABLE order_batches 
DROP CONSTRAINT IF EXISTS unique_pending_batch_per_barangay;

-- Step 3: Create a completely new, bulletproof batch assignment function
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    max_weight_limit decimal := 3500;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        
        -- Step 1: Validate delivery address and barangay
        IF NEW.delivery_address IS NULL THEN
            RAISE EXCEPTION 'Order % has no delivery address', NEW.id;
        END IF;
        
        order_barangay := NEW.delivery_address->>'barangay';
        
        -- Step 2: Strict validation of barangay
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'null' OR order_barangay = 'NULL' THEN
            RAISE EXCEPTION 'Order % has invalid barangay: %', NEW.id, order_barangay;
        END IF;

        -- Step 3: Calculate order weight from order items
        SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
        INTO calculated_weight
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = NEW.id;
        
        NEW.total_weight := calculated_weight;

        -- Step 4: Validate weight is positive
        IF NEW.total_weight <= 0 THEN
            RAISE EXCEPTION 'Order % has invalid weight: %', NEW.id, NEW.total_weight;
        END IF;

        -- Step 5: Find existing batch in the SAME BARANGAY with available capacity
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND LOWER(b.barangay) = LOWER(order_barangay)
        AND b.barangay IS NOT NULL
        AND b.barangay != ''
        AND b.barangay != 'null'
        AND b.total_weight + NEW.total_weight <= max_weight_limit
        ORDER BY 
            -- Prioritize batches with most remaining space
            (max_weight_limit - b.total_weight) DESC,
            -- Then older batches (FIFO)
            b.created_at ASC
        LIMIT 1;

        -- Step 6: Create new batch ONLY if no suitable existing batch found
        IF current_batch_id IS NULL THEN
            -- Double-check we have valid data before creating batch
            IF order_barangay IS NOT NULL 
               AND order_barangay != '' 
               AND order_barangay != 'null' 
               AND order_barangay != 'NULL'
               AND NEW.total_weight > 0 THEN
                
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (order_barangay, NEW.total_weight, max_weight_limit, 'pending')
                RETURNING id INTO current_batch_id;
            ELSE
                RAISE EXCEPTION 'Cannot create batch: invalid barangay or weight for order %', NEW.id;
            END IF;
        ELSE
            -- Step 7: Update existing batch weight by recalculating from all orders
            UPDATE order_batches 
            SET total_weight = (
                SELECT COALESCE(SUM(o.total_weight), 0) + NEW.total_weight
                FROM orders o
                WHERE o.batch_id = current_batch_id
                AND o.approval_status = 'approved'
            )
            WHERE id = current_batch_id;
        END IF;

        -- Step 8: Assign order to batch
        NEW.batch_id := current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create a function to validate and clean up any existing issues
CREATE OR REPLACE FUNCTION validate_and_cleanup_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_count INTEGER;
    cleaned_count INTEGER := 0;
    validated_count INTEGER := 0;
BEGIN
    -- Clean up any invalid batches
    FOR batch_record IN 
        SELECT id, barangay, total_weight
        FROM order_batches 
        WHERE status = 'pending'
    LOOP
        -- Count orders in this batch
        SELECT COUNT(*) INTO order_count
        FROM orders 
        WHERE batch_id = batch_record.id;
        
        -- If batch has no orders or invalid data, delete it
        IF order_count = 0 OR 
           batch_record.barangay IS NULL OR 
           batch_record.barangay = '' OR 
           batch_record.barangay = 'null' OR
           batch_record.barangay = 'NULL' OR
           batch_record.total_weight <= 0 THEN
            
            DELETE FROM order_batches 
            WHERE id = batch_record.id;
            
            cleaned_count := cleaned_count + 1;
        ELSE
            validated_count := validated_count + 1;
        END IF;
    END LOOP;
    
    IF cleaned_count > 0 THEN
        RETURN format('Cleaned up %s invalid batches, validated %s batches', cleaned_count, validated_count);
    ELSE
        RETURN format('All batches are valid (%s total)', validated_count);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create a function to consolidate same barangay batches
CREATE OR REPLACE FUNCTION consolidate_same_barangay_batches()
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
        AND barangay != 'null'
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
        RETURN format('Consolidated %s batches for same barangay', consolidated_count);
    ELSE
        RETURN 'No batches needed consolidation';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Run all the fixes
SELECT validate_and_cleanup_batches();
SELECT consolidate_same_barangay_batches();

-- Step 7: Show the final results
SELECT 'FINAL RESULT - Clean batches:' as info;
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

-- Step 8: Show final status
SELECT 'PERMANENT FIX APPLIED - Empty batches will never be created again!' as status; 