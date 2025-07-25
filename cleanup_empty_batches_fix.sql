-- Fix for empty batches being created when approving orders
-- This will clean up existing empty batches and prevent future ones

-- First, let's see what we have
SELECT 'Current batches before cleanup:' as info;
SELECT id, barangay, total_weight, status, created_at
FROM order_batches 
WHERE status = 'pending'
ORDER BY created_at;

-- Clean up empty batches (those with no orders or 0 weight)
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

-- Update the batch assignment function to prevent empty batches
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

        -- Calculate order weight if not set
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
        END IF;

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

-- Function to validate and fix existing batches
CREATE OR REPLACE FUNCTION validate_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_count INTEGER;
    fixed_count INTEGER := 0;
BEGIN
    -- Check each batch for validity
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
           batch_record.total_weight <= 0 THEN
            
            DELETE FROM order_batches 
            WHERE id = batch_record.id;
            
            fixed_count := fixed_count + 1;
        END IF;
    END LOOP;
    
    IF fixed_count > 0 THEN
        RETURN format('Cleaned up %s invalid batches', fixed_count);
    ELSE
        RETURN 'All batches are valid';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Run validation and cleanup
SELECT validate_batches();

-- Show the results after cleanup
SELECT 'After cleanup - valid batches:' as info;
SELECT id, barangay, total_weight, status, created_at
FROM order_batches 
WHERE status = 'pending'
ORDER BY created_at;

-- Show final status
SELECT 'Empty batches cleaned up and prevention measures applied!' as status; 