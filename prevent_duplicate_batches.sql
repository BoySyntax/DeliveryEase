-- Fix to prevent duplicate batches and ensure proper consolidation
-- This addresses the issue where multiple batches are created for the same barangay

-- First, let's see the current state
SELECT 'Current batches before fix:' as info;
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

-- Function to consolidate all batches from the same barangay
CREATE OR REPLACE FUNCTION consolidate_all_same_barangay_batches()
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
        RETURN format('Consolidated %s batches for same barangay', consolidated_count);
    ELSE
        RETURN 'No batches needed consolidation';
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

-- Function to recalculate batch weights accurately
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

-- Updated batch assignment function to prevent duplicate batches
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
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        -- Validate barangay is not null or empty
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'null' THEN
            RAISE EXCEPTION 'Invalid barangay for order %. Delivery address: %', NEW.id, NEW.delivery_address;
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

        -- PRIORITY 1: Find existing batch in the SAME BARANGAY with available capacity
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND LOWER(b.barangay) = LOWER(order_barangay)
        AND b.barangay IS NOT NULL
        AND b.barangay != ''
        AND b.total_weight + NEW.total_weight <= max_weight_limit
        ORDER BY 
            -- Prioritize batches with most remaining space
            (max_weight_limit - b.total_weight) DESC,
            -- Then older batches (FIFO)
            b.created_at ASC
        LIMIT 1;

        -- PRIORITY 2: If no same-barangay batch with capacity, create new batch for this barangay
        IF current_batch_id IS NULL THEN
            -- Only create batch if we have valid barangay and weight
            IF order_barangay IS NOT NULL AND order_barangay != '' AND NEW.total_weight > 0 THEN
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (order_barangay, NEW.total_weight, max_weight_limit, 'pending')
                RETURNING id INTO current_batch_id;
            ELSE
                RAISE EXCEPTION 'Cannot create batch: invalid barangay or weight for order %', NEW.id;
            END IF;
        ELSE
            -- Update existing batch's total weight by recalculating from all orders
            UPDATE order_batches 
            SET total_weight = (
                SELECT COALESCE(SUM(o.total_weight), 0) + NEW.total_weight
                FROM orders o
                WHERE o.batch_id = current_batch_id
                AND o.approval_status = 'approved'
            )
            WHERE id = current_batch_id;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Run the consolidation and cleanup
SELECT consolidate_all_same_barangay_batches();
SELECT cleanup_invalid_batches();
SELECT recalculate_batch_weights();

-- Show the results after fix
SELECT 'After fix - consolidated batches:' as info;
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

-- Show final status
SELECT 'Duplicate batch prevention applied - orders from same barangay will be consolidated!' as status; 