-- Fix for the unique constraint issue preventing multiple batches per barangay
-- The constraint unique_pending_batch_per_barangay was too restrictive
-- It prevented creating new batches when the current one was full

-- Remove the problematic unique constraint
DROP INDEX IF EXISTS unique_pending_batch_per_barangay;

-- Create a more flexible constraint that allows multiple batches when needed
-- This constraint only prevents duplicates when batches are under capacity
CREATE UNIQUE INDEX IF NOT EXISTS unique_under_capacity_batch_per_barangay 
ON order_batches (barangay) 
WHERE status = 'pending' AND total_weight < max_weight;

-- Update the batch assignment function to handle multiple batches properly
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    lock_key bigint;
BEGIN
    -- Proceed if the order is approved and either:
    -- 1. It was just approved (status changed)
    -- 2. It's approved but doesn't have a batch_id yet
    IF NEW.approval_status = 'approved' AND 
       (OLD.approval_status != 'approved' OR NEW.batch_id IS NULL) THEN
        
        -- Log the delivery_address for debugging
        RAISE NOTICE 'Processing order % with delivery_address: %', NEW.id, NEW.delivery_address;
        
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
        
        RAISE NOTICE 'Extracted barangay: %', order_barangay;
        
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'Unknown Barangay' THEN
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
            RAISE NOTICE 'Calculated weight for order %: %', NEW.id, calculated_weight;
        END IF;

        -- Create a lock key based on barangay to prevent race conditions
        lock_key := abs(hashtext(order_barangay || '_batch_lock'));
        
        -- Acquire advisory lock to prevent concurrent batch creation for same barangay
        PERFORM pg_advisory_xact_lock(lock_key);

        -- Find an existing batch that:
        -- 1. Is pending (not assigned to driver yet)
        -- 2. Has orders from the same barangay
        -- 3. Has enough remaining capacity
        -- 4. Prioritize the batch with the most remaining space (but still under max capacity)
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY (b.max_weight - b.total_weight) DESC, b.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;  -- Skip if another transaction is updating

        RAISE NOTICE 'Found existing batch: %, total_weight: %', current_batch_id, batch_total_weight;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            RAISE NOTICE 'Creating new batch for barangay: %, weight: %', order_barangay, NEW.total_weight;
            
            BEGIN
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
                RETURNING id INTO current_batch_id;
                
                RAISE NOTICE 'Created new batch with id: %', current_batch_id;
            EXCEPTION 
                WHEN unique_violation THEN
                    -- Another transaction created a batch for this barangay, try to use it
                    SELECT b.id INTO current_batch_id
                    FROM order_batches b
                    WHERE b.status = 'pending'
                    AND b.barangay = order_barangay
                    AND b.total_weight + NEW.total_weight <= b.max_weight
                    ORDER BY b.created_at ASC
                    LIMIT 1;
                    
                    IF current_batch_id IS NOT NULL THEN
                        UPDATE order_batches 
                        SET total_weight = total_weight + NEW.total_weight
                        WHERE id = current_batch_id;
                        RAISE NOTICE 'Used existing batch: %', current_batch_id;
                    ELSE
                        -- Still no batch available, this order will remain unbatched
                        RAISE WARNING 'Unable to assign order % to any batch for barangay %', NEW.id, order_barangay;
                    END IF;
            END;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE 'Updated batch % with new total weight: %', current_batch_id, batch_total_weight + NEW.total_weight;
        END IF;

        -- Update the order with the batch_id
        IF current_batch_id IS NOT NULL THEN
            NEW.batch_id := current_batch_id;
            RAISE NOTICE 'Assigned order % to batch %', NEW.id, current_batch_id;
        END IF;
        
        -- Advisory lock is automatically released at end of transaction
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Also create a function to manually assign batches for existing approved orders
CREATE OR REPLACE FUNCTION assign_batches_for_approved_orders()
RETURNS INTEGER AS $$
DECLARE
    order_record RECORD;
    assigned_count INTEGER := 0;
BEGIN
    -- Loop through all approved orders without batch_id
    FOR order_record IN 
        SELECT id, customer_id, delivery_address, total_weight
        FROM orders 
        WHERE approval_status = 'approved' 
        AND batch_id IS NULL
    LOOP
        -- Manually trigger the batch assignment by updating the order
        UPDATE orders 
        SET approval_status = 'approved'  -- This will trigger the batch assignment
        WHERE id = order_record.id;
        
        assigned_count := assigned_count + 1;
    END LOOP;
    
    RETURN assigned_count;
END;
$$ LANGUAGE plpgsql;

-- Run the function to assign batches for existing approved orders
SELECT assign_batches_for_approved_orders() as orders_assigned; 