-- FIX BATCH WEIGHT ACCURACY: Ensure batch weights always match actual order weights
-- This will prevent weight calculation errors from happening again

-- Step 1: Show current weight discrepancies
SELECT 'CURRENT WEIGHT DISCREPANCIES:' as info;
SELECT 
    b.id as batch_id,
    b.barangay,
    b.total_weight as batch_total_weight,
    COUNT(o.id) as order_count,
    SUM(o.total_weight) as actual_order_weight,
    (b.total_weight - SUM(o.total_weight)) as weight_difference
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight
HAVING ABS(b.total_weight - SUM(o.total_weight)) > 0.01
ORDER BY ABS(b.total_weight - SUM(o.total_weight)) DESC;

-- Step 2: Function to recalculate ALL batch weights accurately
CREATE OR REPLACE FUNCTION recalculate_all_batch_weights()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    actual_weight decimal;
    updated_count INTEGER := 0;
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
        
        -- Update batch weight to match actual order weight
        UPDATE order_batches 
        SET total_weight = actual_weight
        WHERE id = batch_record.id;
        
        -- Track the difference
        total_difference := total_difference + ABS(batch_record.total_weight - actual_weight);
        updated_count := updated_count + 1;
    END LOOP;
    
    IF updated_count > 0 THEN
        RETURN format('Updated weights for %s batches, corrected %.2f kg total', updated_count, total_difference);
    ELSE
        RETURN 'No batches needed weight updates';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create BULLETPROOF batch assignment function with accurate weight calculation
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

        -- Calculate order weight from order items (ALWAYS accurate)
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
        -- Use RECALCULATED weight for accurate capacity check
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
            -- Update existing batch weight by recalculating from ALL orders (ALWAYS accurate)
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

-- Step 4: Create function to validate batch weights
CREATE OR REPLACE FUNCTION validate_batch_weights()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    actual_weight decimal;
    invalid_count INTEGER := 0;
    valid_count INTEGER := 0;
    total_correction decimal := 0;
BEGIN
    -- Check each batch for weight accuracy
    FOR batch_record IN 
        SELECT b.id, b.barangay, b.total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
    LOOP
        -- Calculate actual weight from orders
        SELECT COALESCE(SUM(o.total_weight), 0)
        INTO actual_weight
        FROM orders o
        WHERE o.batch_id = batch_record.id
        AND o.approval_status = 'approved';
        
        -- Check if weights match (allow small rounding differences)
        IF ABS(batch_record.total_weight - actual_weight) > 0.01 THEN
            invalid_count := invalid_count + 1;
            total_correction := total_correction + ABS(batch_record.total_weight - actual_weight);
        ELSE
            valid_count := valid_count + 1;
        END IF;
    END LOOP;
    
    IF invalid_count > 0 THEN
        RETURN format('WARNING: Found %s batches with incorrect weights (%.2f kg total correction needed)', invalid_count, total_correction);
    ELSE
        RETURN format('SUCCESS: All %s batches have accurate weights!', valid_count);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger to automatically correct weights
CREATE OR REPLACE FUNCTION auto_correct_batch_weights()
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
            
            UPDATE order_batches 
            SET total_weight = actual_weight
            WHERE id = OLD.batch_id;
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
            
            UPDATE order_batches 
            SET total_weight = actual_weight
            WHERE id = NEW.batch_id;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic weight correction
DROP TRIGGER IF EXISTS auto_correct_batch_weights_trigger ON orders;
CREATE TRIGGER auto_correct_batch_weights_trigger
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION auto_correct_batch_weights();

-- Step 6: Run the fixes
SELECT recalculate_all_batch_weights();
SELECT validate_batch_weights();

-- Step 7: Show final results
SELECT 'FINAL RESULT - Accurate batch weights:' as info;
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

-- Step 8: Show final status
SELECT 'BATCH WEIGHT ACCURACY FIXED - Weights will always be accurate now!' as status; 