-- Fix batch assignment logic to ensure same barangay orders are always grouped together
-- This addresses the issue where approved orders from same barangay create separate batches

-- First, let's update the batch assignment function to prioritize same barangay batches
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
        
        IF order_barangay IS NULL OR order_barangay = '' THEN
            RAISE EXCEPTION 'No barangay found in delivery address for order %. Delivery address: %', NEW.id, NEW.delivery_address;
        END IF;

        -- Calculate order weight if not set
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
        END IF;

        -- PRIORITY 1: Find existing batch in the SAME BARANGAY with available capacity
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND LOWER(b.barangay) = LOWER(order_barangay)  -- Case-insensitive match
        AND b.total_weight + NEW.total_weight <= max_weight_limit
        ORDER BY 
            -- Prioritize batches with most remaining space
            (max_weight_limit - b.total_weight) DESC,
            -- Then older batches (FIFO)
            b.created_at ASC
        LIMIT 1;

        -- PRIORITY 2: If no same-barangay batch with capacity, create new batch for this barangay
        IF current_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, max_weight_limit, 'pending')
            RETURNING id INTO current_batch_id;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
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

-- Function to consolidate existing batches from the same barangay
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

-- Function to fix orders that are in different batches for the same barangay
CREATE OR REPLACE FUNCTION fix_same_barangay_orders()
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    target_batch_id uuid;
    fixed_count INTEGER := 0;
    max_weight_limit decimal := 3500;
BEGIN
    -- For each order that's in a batch with other orders from same barangay in different batches
    FOR order_record IN 
        SELECT DISTINCT o.id, o.batch_id, o.total_weight, o.delivery_address->>'barangay' as barangay
        FROM orders o
        JOIN order_batches b ON b.id = o.batch_id
        WHERE o.approval_status = 'approved'
        AND b.status = 'pending'
        AND o.delivery_address->>'barangay' IS NOT NULL
    LOOP
        -- Find the oldest batch for this barangay
        SELECT id INTO target_batch_id
        FROM order_batches 
        WHERE status = 'pending'
        AND LOWER(barangay) = LOWER(order_record.barangay)
        ORDER BY created_at ASC
        LIMIT 1;
        
        -- If this order is not in the target batch, move it
        IF order_record.batch_id != target_batch_id THEN
            -- Check if moving would exceed capacity
            DECLARE
                target_weight decimal;
                new_total_weight decimal;
            BEGIN
                SELECT total_weight INTO target_weight
                FROM order_batches 
                WHERE id = target_batch_id;
                
                new_total_weight := target_weight + order_record.total_weight;
                
                -- If it would exceed capacity, leave it where it is
                IF new_total_weight <= max_weight_limit THEN
                    UPDATE orders 
                    SET batch_id = target_batch_id
                    WHERE id = order_record.id;
                    
                    -- Update target batch weight
                    UPDATE order_batches 
                    SET total_weight = new_total_weight
                    WHERE id = target_batch_id;
                    
                    fixed_count := fixed_count + 1;
                END IF;
            END;
        END IF;
    END LOOP;
    
    IF fixed_count > 0 THEN
        RETURN format('Fixed %s orders to ensure same barangay batching', fixed_count);
    ELSE
        RETURN 'No orders needed fixing';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Clean up empty batches
CREATE OR REPLACE FUNCTION cleanup_empty_batches()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM order_batches 
    WHERE status = 'pending'
    AND id NOT IN (
        SELECT DISTINCT batch_id 
        FROM orders 
        WHERE batch_id IS NOT NULL
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Run the consolidation and fixes
SELECT consolidate_same_barangay_batches();
SELECT fix_same_barangay_orders();
SELECT cleanup_empty_batches();

-- Show the results
SELECT 'After fix - batches by barangay:' as info;
SELECT barangay, COUNT(*) as batch_count, SUM(total_weight) as total_weight
FROM order_batches 
WHERE status = 'pending'
GROUP BY barangay
ORDER BY barangay;

-- Show final status
SELECT 'Batch assignment logic fixed - orders from same barangay will now be grouped together!' as status; 