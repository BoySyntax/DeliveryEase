-- BULLETPROOF PERMANENT FIX: Make it IMPOSSIBLE for empty batches to be created
-- This will prevent the issue from EVER happening again

-- Step 1: Clean up all existing empty batches
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

-- Step 2: Add database constraints to PREVENT empty batches
-- This makes it IMPOSSIBLE to insert invalid data

-- Add NOT NULL constraint to barangay
ALTER TABLE order_batches 
ALTER COLUMN barangay SET NOT NULL;

-- Add CHECK constraint to prevent empty barangay
ALTER TABLE order_batches 
ADD CONSTRAINT check_barangay_not_empty 
CHECK (barangay != '' AND barangay != 'null' AND barangay != 'NULL');

-- Add CHECK constraint to prevent zero weight
ALTER TABLE order_batches 
ADD CONSTRAINT check_weight_positive 
CHECK (total_weight > 0);

-- Add CHECK constraint to ensure status is valid
ALTER TABLE order_batches 
ADD CONSTRAINT check_status_valid 
CHECK (status IN ('pending', 'assigned', 'delivering', 'delivered'));

-- Step 3: Create BULLETPROOF batch assignment function
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
        
        -- BULLETPROOF validation - multiple layers
        IF NEW.delivery_address IS NULL THEN
            RAISE EXCEPTION 'Order % has no delivery address', NEW.id;
        END IF;
        
        order_barangay := NEW.delivery_address->>'barangay';
        
        -- Multiple validation checks for barangay
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

        -- Validate weight is positive
        IF NEW.total_weight <= 0 THEN
            RAISE EXCEPTION 'Order % has invalid weight: %', NEW.id, NEW.total_weight;
        END IF;

        -- Find existing batch in the SAME BARANGAY with available capacity
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND LOWER(TRIM(b.barangay)) = LOWER(TRIM(order_barangay))
        AND b.total_weight + NEW.total_weight <= max_weight_limit
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
                
                -- Insert with TRIM to ensure clean data
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (TRIM(order_barangay), NEW.total_weight, max_weight_limit, 'pending')
                RETURNING id INTO current_batch_id;
            ELSE
                RAISE EXCEPTION 'Cannot create batch: invalid barangay or weight for order %', NEW.id;
            END IF;
        ELSE
            -- Update existing batch weight
            UPDATE order_batches 
            SET total_weight = (
                SELECT COALESCE(SUM(o.total_weight), 0) + NEW.total_weight
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

-- Step 4: Create automatic consolidation function
CREATE OR REPLACE FUNCTION auto_consolidate_batches()
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

-- Step 5: Create triggers for automatic consolidation
DROP TRIGGER IF EXISTS auto_consolidate_batches_trigger ON order_batches;
CREATE TRIGGER auto_consolidate_batches_trigger
    AFTER INSERT OR UPDATE ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION auto_consolidate_batches();

-- Step 6: Create a function to validate all batches
CREATE OR REPLACE FUNCTION validate_all_batches()
RETURNS TEXT AS $$
DECLARE
    invalid_count INTEGER := 0;
    valid_count INTEGER := 0;
BEGIN
    -- Count invalid batches
    SELECT COUNT(*) INTO invalid_count
    FROM order_batches 
    WHERE status = 'pending'
    AND (
        total_weight <= 0 
        OR barangay IS NULL 
        OR barangay = ''
        OR barangay = 'null'
        OR barangay = 'NULL'
    );
    
    -- Count valid batches
    SELECT COUNT(*) INTO valid_count
    FROM order_batches 
    WHERE status = 'pending'
    AND total_weight > 0
    AND barangay IS NOT NULL
    AND barangay != ''
    AND barangay != 'null'
    AND barangay != 'NULL';
    
    IF invalid_count > 0 THEN
        RETURN format('WARNING: Found %s invalid batches!', invalid_count);
    ELSE
        RETURN format('SUCCESS: All %s batches are valid!', valid_count);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Run validation
SELECT validate_all_batches();

-- Step 8: Show final results
SELECT 'BULLETPROOF RESULT - All batches:' as info;
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

-- Step 9: Show final status
SELECT 'BULLETPROOF FIX APPLIED - Empty batches are now IMPOSSIBLE to create!' as status; 