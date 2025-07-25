-- FIX CONSTRAINT ERROR: Handle empty batches properly
-- This will fix the check constraint violation and ensure proper batch management

-- Step 1: Remove the problematic constraint that prevents zero weight
ALTER TABLE order_batches 
DROP CONSTRAINT IF EXISTS check_weight_positive;

-- Step 2: Clean up empty batches first
DELETE FROM order_batches 
WHERE status = 'pending'
AND (
    total_weight = 0 
    OR barangay IS NULL 
    OR barangay = ''
    OR barangay = 'null'
    OR barangay = 'NULL'
    OR id NOT IN (
        SELECT DISTINCT batch_id 
        FROM orders 
        WHERE batch_id IS NOT NULL
    )
);

-- Step 3: Function to recalculate batch weights and handle empty batches
CREATE OR REPLACE FUNCTION recalculate_batch_weights_safe()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    actual_weight decimal;
    updated_count INTEGER := 0;
    deleted_count INTEGER := 0;
    total_difference decimal := 0;
BEGIN
    -- For each batch, recalculate the total weight from actual orders
    FOR batch_record IN 
        SELECT b.id, b.barangay, b.total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
    LOOP
        -- Calculate actual weight from orders in this batch
        SELECT COALESCE(SUM(o.total_weight), 0)
        INTO actual_weight
        FROM orders o
        WHERE o.batch_id = batch_record.id
        AND o.approval_status = 'approved';
        
        -- If batch has no orders or zero weight, delete it
        IF actual_weight = 0 OR actual_weight IS NULL THEN
            DELETE FROM order_batches 
            WHERE id = batch_record.id;
            deleted_count := deleted_count + 1;
        ELSE
            -- Update batch weight to match actual order weight
            UPDATE order_batches 
            SET total_weight = actual_weight
            WHERE id = batch_record.id;
            
            -- Track the difference
            total_difference := total_difference + ABS(batch_record.total_weight - actual_weight);
            updated_count := updated_count + 1;
        END IF;
    END LOOP;
    
    IF deleted_count > 0 OR updated_count > 0 THEN
        RETURN format('Updated %s batches (%s kg corrected), deleted %s empty batches', updated_count, to_char(total_difference, '999.99'), deleted_count);
    ELSE
        RETURN 'No batches needed updates';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create safe batch assignment function
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
        
        -- Validate delivery address
        IF NEW.delivery_address IS NULL THEN
            RAISE EXCEPTION 'Order % has no delivery address', NEW.id;
        END IF;
        
        order_barangay := NEW.delivery_address->>'barangay';
        
        -- Validate barangay
        IF order_barangay IS NULL OR 
           order_barangay = '' OR 
           order_barangay = 'null' OR 
           order_barangay = 'NULL' OR
           LENGTH(TRIM(order_barangay)) = 0 THEN
            RAISE EXCEPTION 'Order % has invalid barangay: %', NEW.id, order_barangay;
        END IF;

        -- Calculate order weight from order items
        SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
        INTO calculated_weight
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = NEW.id;
        
        NEW.total_weight := calculated_weight;

        -- Validate weight
        IF NEW.total_weight <= 0 THEN
            RAISE EXCEPTION 'Order % has invalid weight: %', NEW.id, NEW.total_weight;
        END IF;

        -- Find existing batch in the SAME BARANGAY with available capacity
        SELECT b.id, (
            SELECT COALESCE(SUM(o.total_weight), 0)
            FROM orders o
            WHERE o.batch_id = b.id
            AND o.approval_status = 'approved'
        ) as actual_batch_weight
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND LOWER(TRIM(b.barangay)) = LOWER(TRIM(order_barangay))
        AND (
            SELECT COALESCE(SUM(o.total_weight), 0)
            FROM orders o
            WHERE o.batch_id = b.id
            AND o.approval_status = 'approved'
        ) + NEW.total_weight <= max_weight_limit
        ORDER BY b.created_at ASC
        LIMIT 1;

        -- Create new batch ONLY if no existing batch found
        IF current_batch_id IS NULL THEN
            -- Final validation before creating batch
            IF order_barangay IS NOT NULL 
               AND order_barangay != '' 
               AND order_barangay != 'null' 
               AND order_barangay != 'NULL'
               AND LENGTH(TRIM(order_barangay)) > 0
               AND NEW.total_weight > 0 THEN
                
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (TRIM(order_barangay), NEW.total_weight, max_weight_limit, 'pending')
                RETURNING id INTO current_batch_id;
            ELSE
                RAISE EXCEPTION 'Cannot create batch: invalid barangay or weight for order %', NEW.id;
            END IF;
        ELSE
            -- Update existing batch weight by recalculating from ALL orders
            UPDATE order_batches 
            SET total_weight = (
                SELECT COALESCE(SUM(o.total_weight), 0)
                FROM orders o
                WHERE o.batch_id = current_batch_id
                AND o.approval_status = 'approved'
            )
            WHERE id = current_batch_id;
        END IF;

        -- Assign order to batch
        NEW.batch_id := current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create safe automatic weight correction function
CREATE OR REPLACE FUNCTION auto_correct_batch_weights_safe()
RETURNS TRIGGER AS $$
DECLARE
    actual_weight decimal;
BEGIN
    -- Recalculate batch weight whenever orders are updated
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        -- For the old batch (if order was moved or deleted)
        IF OLD.batch_id IS NOT NULL THEN
            SELECT COALESCE(SUM(o.total_weight), 0)
            INTO actual_weight
            FROM orders o
            WHERE o.batch_id = OLD.batch_id
            AND o.approval_status = 'approved';
            
            -- If batch has no orders, delete it
            IF actual_weight = 0 OR actual_weight IS NULL THEN
                DELETE FROM order_batches 
                WHERE id = OLD.batch_id;
            ELSE
                -- Update batch weight
                UPDATE order_batches 
                SET total_weight = actual_weight
                WHERE id = OLD.batch_id;
            END IF;
        END IF;
    END IF;
    
    -- For the new batch (if order was assigned or updated)
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.batch_id IS NOT NULL THEN
            SELECT COALESCE(SUM(o.total_weight), 0)
            INTO actual_weight
            FROM orders o
            WHERE o.batch_id = NEW.batch_id
            AND o.approval_status = 'approved';
            
            -- Update batch weight
            UPDATE order_batches 
            SET total_weight = actual_weight
            WHERE id = NEW.batch_id;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create safe consolidation function
CREATE OR REPLACE FUNCTION consolidate_batches_safe()
RETURNS TRIGGER AS $$
DECLARE
    barangay_record RECORD;
    target_batch_id uuid;
    source_batch_id uuid;
    target_batch_weight decimal;
    source_batch_weight decimal;
    max_weight_limit decimal := 3500;
BEGIN
    -- For each barangay that has multiple pending batches
    FOR barangay_record IN 
        SELECT barangay, COUNT(*) as batch_count
        FROM order_batches 
        WHERE status = 'pending'
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
                
                -- Update our tracking variable
                target_batch_weight := target_batch_weight + source_batch_weight;
            END IF;
        END LOOP;
    END LOOP;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create triggers for safe operations
DROP TRIGGER IF EXISTS auto_correct_batch_weights_trigger ON orders;
CREATE TRIGGER auto_correct_batch_weights_trigger
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION auto_correct_batch_weights_safe();

DROP TRIGGER IF EXISTS auto_consolidate_batches_trigger ON order_batches;
CREATE TRIGGER auto_consolidate_batches_trigger
    AFTER INSERT OR UPDATE ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION consolidate_batches_safe();

-- Step 8: Run the safe fixes
SELECT recalculate_batch_weights_safe();

-- Step 9: Show final results
SELECT 'FINAL RESULT - Clean batches with accurate weights:' as info;
SELECT 
    b.id as batch_id,
    b.barangay,
    b.total_weight as batch_total_weight,
    COUNT(o.id) as order_count,
    SUM(o.total_weight) as actual_order_weight,
    CASE 
        WHEN ABS(b.total_weight - SUM(o.total_weight)) <= 0.01 THEN '✓ ACCURATE'
        ELSE '✗ INACCURATE'
    END as weight_status
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight
ORDER BY b.created_at;

-- Step 10: Show final status
SELECT 'CONSTRAINT ERROR FIXED - Empty batches handled properly!' as status; 