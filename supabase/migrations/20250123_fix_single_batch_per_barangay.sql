 -- Fix batch assignment to ensure only ONE batch per barangay until 3500kg limit
-- This migration consolidates existing duplicate batches and updates the assignment logic

-- First, let's consolidate existing batches for the same barangay
DO $$
DECLARE
    barangay_record RECORD;
    target_batch_id UUID;
    source_batch RECORD;
    total_consolidated_weight DECIMAL;
BEGIN
    -- Loop through each barangay that has multiple pending batches
    FOR barangay_record IN
        SELECT barangay, COUNT(*) as batch_count
        FROM order_batches
        WHERE status = 'pending'
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        RAISE NOTICE 'Consolidating batches for barangay: %', barangay_record.barangay;
        
        -- Get the oldest batch as the target (keep this one)
        SELECT id INTO target_batch_id
        FROM order_batches
        WHERE barangay = barangay_record.barangay 
        AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1;
        
        RAISE NOTICE 'Target batch for %: %', barangay_record.barangay, target_batch_id;
        
        -- Initialize total weight
        total_consolidated_weight := 0;
        
        -- Move all orders from other batches to the target batch
        FOR source_batch IN
            SELECT id, total_weight
            FROM order_batches
            WHERE barangay = barangay_record.barangay 
            AND status = 'pending' 
            AND id != target_batch_id
            ORDER BY created_at ASC
        LOOP
            RAISE NOTICE 'Moving orders from batch % (weight: %) to target batch %', 
                source_batch.id, source_batch.total_weight, target_batch_id;
            
            -- Move orders to target batch
            UPDATE orders 
            SET batch_id = target_batch_id 
            WHERE batch_id = source_batch.id;
            
            -- Add to total weight
            total_consolidated_weight := total_consolidated_weight + source_batch.total_weight;
            
            -- Delete the empty source batch
            DELETE FROM order_batches WHERE id = source_batch.id;
            
            RAISE NOTICE 'Consolidated batch % into target batch %', source_batch.id, target_batch_id;
        END LOOP;
        
        -- Update target batch with correct total weight
        UPDATE order_batches 
        SET total_weight = (
            SELECT COALESCE(SUM(o.total_weight), 0)
            FROM orders o
            WHERE o.batch_id = target_batch_id
        )
        WHERE id = target_batch_id;
        
        RAISE NOTICE 'Updated target batch % with consolidated weight', target_batch_id;
    END LOOP;
END $$;

-- Update the batch assignment function to ensure ONLY ONE batch per barangay
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

        -- CRITICAL: Find ANY existing pending batch for this barangay (there should only be one)
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        ORDER BY b.created_at ASC  -- Get the oldest one
        LIMIT 1
        FOR UPDATE;

        RAISE NOTICE 'Found existing batch for %: % with weight %', order_barangay, current_batch_id, batch_total_weight;

        -- Check if the existing batch can accommodate this order
        IF current_batch_id IS NOT NULL THEN
            IF batch_total_weight + NEW.total_weight <= 3500 THEN
                -- Add to existing batch
                UPDATE order_batches 
                SET total_weight = batch_total_weight + NEW.total_weight
                WHERE id = current_batch_id;
                
                NEW.batch_id := current_batch_id;
                RAISE NOTICE 'Added order % (%.2f kg) to existing batch % for %', NEW.id, NEW.total_weight, current_batch_id, order_barangay;
            ELSE
                -- Existing batch would exceed capacity, create a new one
                RAISE NOTICE 'Existing batch % would exceed capacity (%.2f + %.2f > 3500), creating new batch for %', 
                    current_batch_id, batch_total_weight, NEW.total_weight, order_barangay;
                
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
                RETURNING id INTO current_batch_id;
                
                NEW.batch_id := current_batch_id;
                RAISE NOTICE 'Created new batch % for % with weight %.2f kg', current_batch_id, order_barangay, NEW.total_weight;
            END IF;
        ELSE
            -- No existing batch for this barangay, create the first one
            RAISE NOTICE 'No existing batch for %, creating first batch with weight %.2f kg', order_barangay, NEW.total_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
            
            NEW.batch_id := current_batch_id;
            RAISE NOTICE 'Created first batch % for % with weight %.2f kg', current_batch_id, order_barangay, NEW.total_weight;
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Create a function to prevent multiple batches for the same barangay
CREATE OR REPLACE FUNCTION prevent_duplicate_barangay_batches()
RETURNS TRIGGER AS $$
DECLARE
    existing_batch_count INTEGER;
BEGIN
    -- Only check for pending batches
    IF NEW.status = 'pending' THEN
        SELECT COUNT(*) INTO existing_batch_count
        FROM order_batches
        WHERE barangay = NEW.barangay 
        AND status = 'pending'
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
        
        IF existing_batch_count > 0 THEN
            RAISE EXCEPTION 'Cannot create new batch for barangay %. A pending batch already exists. Current batches should reach 3500kg before creating new ones.', NEW.barangay;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to prevent duplicate barangay batches
DROP TRIGGER IF EXISTS prevent_duplicate_barangay_batches_trigger ON order_batches;
CREATE TRIGGER prevent_duplicate_barangay_batches_trigger
    BEFORE INSERT ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION prevent_duplicate_barangay_batches();

-- Update any remaining inconsistencies in batch weights
UPDATE order_batches 
SET total_weight = (
    SELECT COALESCE(SUM(o.total_weight), 0)
    FROM orders o
    WHERE o.batch_id = order_batches.id
)
WHERE status = 'pending';

-- Log the consolidation results
DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE '=== BATCH CONSOLIDATION COMPLETE ===';
    RAISE NOTICE 'Batches per barangay after consolidation:';
    
    FOR r IN 
        SELECT barangay, COUNT(*) as batch_count, SUM(total_weight) as total_weight
        FROM order_batches 
        WHERE status = 'pending'
        GROUP BY barangay
        ORDER BY barangay
    LOOP
        RAISE NOTICE 'Barangay: % | Batches: % | Total Weight: % kg', r.barangay, r.batch_count, r.total_weight;
    END LOOP;
END $$; 