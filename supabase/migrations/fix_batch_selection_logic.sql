-- Fix batch selection logic to use FIFO (First In, First Out) approach
-- This ensures orders keep going to the same batch until it reaches 3500kg capacity

CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    lock_key bigint;
BEGIN
    -- Process the order if it's approved and either:
    -- 1. It was just approved (status changed)
    -- 2. It's approved but doesn't have a batch_id yet
    IF NEW.approval_status = 'approved' AND 
       (OLD.approval_status != 'approved' OR NEW.batch_id IS NULL) THEN
        
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        -- If barangay is still missing, try to get it from addresses table
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'Unknown Barangay' THEN
            SELECT a.barangay INTO order_barangay
            FROM addresses a
            WHERE a.customer_id = NEW.customer_id
            ORDER BY a.created_at DESC
            LIMIT 1;
            
            -- Update the delivery_address with the found barangay
            IF order_barangay IS NOT NULL AND order_barangay != '' THEN
                NEW.delivery_address := jsonb_set(
                    COALESCE(NEW.delivery_address, '{}'::jsonb),
                    '{barangay}',
                    order_barangay::jsonb
                );
            END IF;
        END IF;
        
        -- If still no barangay, use a default
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'Unknown Barangay' THEN
            order_barangay := 'Default Area';
            NEW.delivery_address := jsonb_set(
                COALESCE(NEW.delivery_address, '{}'::jsonb),
                '{barangay}',
                order_barangay::jsonb
            );
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

        -- Create a lock key based on barangay to prevent race conditions
        lock_key := abs(hashtext(order_barangay || '_batch_lock'));
        
        -- Acquire advisory lock to prevent concurrent batch creation for same barangay
        PERFORM pg_advisory_xact_lock(lock_key);

        -- CRITICAL FIX: Use FIFO (First In, First Out) approach
        -- Find the OLDEST pending batch for this barangay that has capacity
        -- This ensures orders keep going to the same batch until it's full
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY b.created_at ASC  -- OLDEST FIRST (FIFO)
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_barangay, NEW.total_weight, 3500)
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

-- Re-process all approved orders that don't have a batch_id
-- This will fix existing orders using the new FIFO logic
DO $$
DECLARE
    order_record RECORD;
BEGIN
    FOR order_record IN
        SELECT id, approval_status, delivery_address, customer_id, total_weight
        FROM orders
        WHERE approval_status = 'approved' AND batch_id IS NULL
    LOOP
        -- Manually trigger the batch assignment for each order
        UPDATE orders 
        SET approval_status = 'approved'  -- This will trigger the function
        WHERE id = order_record.id;
    END LOOP;
END $$;

-- Clean up any empty batches that might have been created
DELETE FROM order_batches 
WHERE id NOT IN (
    SELECT DISTINCT batch_id 
    FROM orders 
    WHERE batch_id IS NOT NULL
);

-- Update batch total weights to reflect actual order weights
UPDATE order_batches 
SET total_weight = (
    SELECT COALESCE(SUM(o.total_weight), 0)
    FROM orders o
    WHERE o.batch_id = order_batches.id
    AND o.approval_status = 'approved'
)
WHERE id IN (
    SELECT DISTINCT batch_id 
    FROM orders 
    WHERE batch_id IS NOT NULL
);

-- Show the results
SELECT 
    'Orders processed with FIFO logic' as status,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' 
AND batch_id IS NOT NULL;

SELECT 
    'Batches created' as status,
    COUNT(*) as count
FROM order_batches;

-- Show batch distribution
SELECT 
    'Batch distribution by barangay:' as info,
    barangay,
    COUNT(*) as batch_count,
    SUM(total_weight) as total_weight,
    AVG(total_weight) as avg_weight
FROM order_batches
GROUP BY barangay
ORDER BY barangay; 