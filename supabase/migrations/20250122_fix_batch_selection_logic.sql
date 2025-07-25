-- Fix for batch selection logic to ensure orders are assigned to existing batches before creating new ones
-- The issue was that the current logic wasn't properly finding existing batches with capacity

-- Update the batch assignment function with improved logic
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    lock_key bigint;
    available_batches RECORD;
BEGIN
    -- Proceed if the order is approved and either:
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
        END IF;

        -- Create a lock key based on barangay to prevent race conditions
        lock_key := abs(hashtext(order_barangay || '_batch_lock'));
        
        -- Acquire advisory lock to prevent concurrent batch creation for same barangay
        PERFORM pg_advisory_xact_lock(lock_key);

        -- IMPROVED BATCH SELECTION LOGIC
        -- First, try to find any existing batch with capacity (prioritize oldest first)
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY b.created_at ASC  -- Use oldest batch first (FIFO)
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        -- If no batch found with capacity, check if there are any batches that could fit this order
        -- This helps debug why batches aren't being found
        IF current_batch_id IS NULL THEN
            RAISE NOTICE 'No batch found with capacity for order % (weight: %) in barangay %', NEW.id, NEW.total_weight, order_barangay;
            
            -- Log available batches for debugging
            FOR available_batches IN
                SELECT id, total_weight, max_weight, (max_weight - total_weight) as remaining_capacity
                FROM order_batches
                WHERE status = 'pending'
                AND barangay = order_barangay
                ORDER BY created_at ASC
            LOOP
                RAISE NOTICE 'Available batch %: weight=%, max=%, remaining=%', 
                    available_batches.id, 
                    available_batches.total_weight, 
                    available_batches.max_weight, 
                    available_batches.remaining_capacity;
            END LOOP;
        END IF;

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
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Create a function to consolidate existing batches that should be merged
CREATE OR REPLACE FUNCTION consolidate_underutilized_batches()
RETURNS INTEGER AS $$
DECLARE
    batch_record RECORD;
    target_batch_id uuid;
    source_batch RECORD;
    consolidated_count INTEGER := 0;
BEGIN
    -- Find barangays with multiple batches where some could be consolidated
    FOR batch_record IN
        SELECT barangay, COUNT(*) as batch_count
        FROM order_batches
        WHERE status = 'pending'
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        -- Get the oldest batch as target
        SELECT id INTO target_batch_id
        FROM order_batches
        WHERE barangay = batch_record.barangay 
        AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1;
        
        -- Move orders from newer batches to the oldest batch if they fit
        FOR source_batch IN
            SELECT id, total_weight
            FROM order_batches
            WHERE barangay = batch_record.barangay 
            AND status = 'pending' 
            AND id != target_batch_id
            ORDER BY created_at ASC
        LOOP
            -- Check if the source batch's orders can fit in the target batch
            IF (SELECT total_weight FROM order_batches WHERE id = target_batch_id) + source_batch.total_weight <= 3500 THEN
                -- Move orders to target batch
                UPDATE orders 
                SET batch_id = target_batch_id 
                WHERE batch_id = source_batch.id;
                
                -- Update target batch weight
                UPDATE order_batches 
                SET total_weight = total_weight + source_batch.total_weight
                WHERE id = target_batch_id;
                
                -- Delete the empty source batch
                DELETE FROM order_batches WHERE id = source_batch.id;
                
                consolidated_count := consolidated_count + 1;
                RAISE NOTICE 'Consolidated batch % into batch %', source_batch.id, target_batch_id;
            END IF;
        END LOOP;
    END LOOP;
    
    RETURN consolidated_count;
END;
$$ LANGUAGE plpgsql;

-- Run consolidation to fix existing issues
SELECT consolidate_underutilized_batches() as batches_consolidated; 