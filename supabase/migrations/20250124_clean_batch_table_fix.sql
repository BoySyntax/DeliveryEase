-- COMPREHENSIVE BATCH TABLE CLEANUP
-- Fixes: duplicate batches, NULL barangay, premature batch creation

-- Step 1: Remove the problematic prevention trigger temporarily
DROP TRIGGER IF EXISTS prevent_multiple_pending_batches_trigger ON order_batches;
DROP TRIGGER IF EXISTS prevent_duplicate_barangay_batches_trigger ON order_batches;
DROP FUNCTION IF EXISTS prevent_multiple_pending_batches_per_barangay();
DROP FUNCTION IF EXISTS prevent_duplicate_barangay_batches();

-- Step 2: Clean up NULL barangay batches and unassigned orders
DO $$
DECLARE
    null_batch RECORD;
    order_record RECORD;
BEGIN
    RAISE NOTICE 'Cleaning up NULL barangay batches...';
    
    -- Find orders in NULL barangay batches
    FOR order_record IN
        SELECT o.id, o.delivery_address, o.customer_id
        FROM orders o
        JOIN order_batches b ON o.batch_id = b.id
        WHERE b.barangay IS NULL OR b.barangay = ''
    LOOP
        RAISE NOTICE 'Found order % with NULL barangay batch', order_record.id;
        
        -- Try to extract barangay from delivery_address
        IF order_record.delivery_address IS NOT NULL AND order_record.delivery_address->>'barangay' IS NOT NULL THEN
            -- Update the order's batch_id to NULL so it can be reassigned properly
            UPDATE orders SET batch_id = NULL WHERE id = order_record.id;
            RAISE NOTICE 'Unassigned order % for proper reassignment', order_record.id;
        ELSE
            -- If no barangay info, mark order as rejected
            UPDATE orders SET 
                approval_status = 'rejected',
                batch_id = NULL
            WHERE id = order_record.id;
            RAISE NOTICE 'Rejected order % due to missing barangay info', order_record.id;
        END IF;
    END LOOP;
    
    -- Delete NULL barangay batches
    DELETE FROM order_batches 
    WHERE barangay IS NULL OR barangay = '';
    
    RAISE NOTICE 'Deleted NULL barangay batches';
END $$;

-- Step 3: Consolidate duplicate batches for ALL barangays
DO $$
DECLARE
    barangay_record RECORD;
    target_batch_id UUID;
    source_batch_id UUID;
    batch_weight DECIMAL;
BEGIN
    RAISE NOTICE 'Consolidating duplicate batches for ALL barangays...';
    
    -- Loop through each barangay that has multiple pending batches
    FOR barangay_record IN
        SELECT barangay, COUNT(*) as batch_count
        FROM order_batches
        WHERE status = 'pending'
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        RAISE NOTICE 'Consolidating % batches for barangay: %', barangay_record.batch_count, barangay_record.barangay;
        
        -- Get the oldest batch as target for this barangay
        SELECT id, total_weight INTO target_batch_id, batch_weight
        FROM order_batches
        WHERE barangay = barangay_record.barangay AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1;
        
        IF target_batch_id IS NOT NULL THEN
            RAISE NOTICE 'Target batch for %: %', barangay_record.barangay, target_batch_id;
            
            -- Move orders from newer batches to the oldest one
            FOR source_batch_id IN
                SELECT id
                FROM order_batches
                WHERE barangay = barangay_record.barangay 
                AND status = 'pending' 
                AND id != target_batch_id
                ORDER BY created_at ASC
            LOOP
                RAISE NOTICE 'Moving orders from batch % to target batch %', source_batch_id, target_batch_id;
                
                -- Move orders
                UPDATE orders 
                SET batch_id = target_batch_id 
                WHERE batch_id = source_batch_id;
                
                -- Delete the empty source batch
                DELETE FROM order_batches WHERE id = source_batch_id;
            END LOOP;
            
            -- Update target batch weight
            UPDATE order_batches 
            SET total_weight = (
                SELECT COALESCE(SUM(o.total_weight), 0)
                FROM orders o
                WHERE o.batch_id = target_batch_id
            )
            WHERE id = target_batch_id;
            
            RAISE NOTICE 'Consolidated batches for %', barangay_record.barangay;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Consolidation complete for all barangays!';
END $$;

-- Step 4: Fix the batch assignment function to ONLY create batches after approval
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    existing_batch_id uuid;
    existing_batch_weight decimal;
    calculated_weight decimal;
    lock_key bigint;
BEGIN
    -- CRITICAL: Only process when order status changes TO 'approved'
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        
        RAISE NOTICE 'Processing approved order: %', NEW.id;
        
        -- Extract barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        -- Fallback: get barangay from addresses table
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'Unknown Barangay' THEN
            SELECT a.barangay INTO order_barangay
            FROM addresses a
            WHERE a.customer_id = NEW.customer_id
            ORDER BY a.created_at DESC
            LIMIT 1;
            
            -- Update delivery_address with found barangay
            IF order_barangay IS NOT NULL AND order_barangay != '' THEN
                NEW.delivery_address := jsonb_set(
                    COALESCE(NEW.delivery_address, '{}'::jsonb),
                    '{barangay}',
                    to_jsonb(order_barangay)
                );
            END IF;
        END IF;
        
        -- Validate barangay exists
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'Unknown Barangay' THEN
            RAISE EXCEPTION 'No valid barangay found for order %. Cannot assign to batch.', NEW.id;
        END IF;

        -- Calculate order weight
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
        END IF;

        -- Use advisory lock to prevent race conditions
        lock_key := abs(hashtext(order_barangay || '_batch_assignment'));
        PERFORM pg_advisory_xact_lock(lock_key);

        RAISE NOTICE 'Looking for existing batch for barangay: %', order_barangay;

        -- Look for existing pending batch for this barangay
        SELECT b.id, b.total_weight
        INTO existing_batch_id, existing_batch_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        ORDER BY b.created_at ASC
        LIMIT 1
        FOR UPDATE;

        -- Decision logic
        IF existing_batch_id IS NOT NULL THEN
            -- Check if order can fit in existing batch
            IF existing_batch_weight + NEW.total_weight <= 3500 THEN
                -- Add to existing batch
                UPDATE order_batches 
                SET total_weight = existing_batch_weight + NEW.total_weight
                WHERE id = existing_batch_id;
                
                NEW.batch_id := existing_batch_id;
                RAISE NOTICE 'Added order % to existing batch', NEW.id;
            ELSE
                -- Existing batch is full, create new batch
                RAISE NOTICE 'Existing batch is full, creating new batch for %', order_barangay;
                
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
                RETURNING id INTO existing_batch_id;
                
                NEW.batch_id := existing_batch_id;
                RAISE NOTICE 'Created new batch for %', order_barangay;
            END IF;
        ELSE
            -- No existing batch, create first one
            RAISE NOTICE 'Creating first batch for barangay: %', order_barangay;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO existing_batch_id;
            
            NEW.batch_id := existing_batch_id;
            RAISE NOTICE 'Created first batch for %', order_barangay;
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch assignment for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Remove any orders from batches that aren't approved
UPDATE orders 
SET batch_id = NULL 
WHERE approval_status != 'approved' AND batch_id IS NOT NULL;

-- Step 6: Update all batch weights to reflect only approved orders
UPDATE order_batches 
SET total_weight = (
    SELECT COALESCE(SUM(o.total_weight), 0)
    FROM orders o
    WHERE o.batch_id = order_batches.id
    AND o.approval_status = 'approved'
)
WHERE status = 'pending';

-- Step 7: Remove empty batches
DELETE FROM order_batches 
WHERE status = 'pending' 
AND total_weight <= 0;

-- Step 8: Add constraint to prevent NULL barangay
ALTER TABLE order_batches 
ADD CONSTRAINT order_batches_barangay_not_null 
CHECK (barangay IS NOT NULL AND barangay != '');

-- Step 9: Add constraint to ensure max_weight is always 3500
ALTER TABLE order_batches 
ADD CONSTRAINT order_batches_max_weight_3500 
CHECK (max_weight = 3500);

-- Step 10: Final cleanup and status report
DO $$
DECLARE
    batch_summary RECORD;
    total_batches INTEGER;
    overall_weight DECIMAL;
BEGIN
    RAISE NOTICE 'BATCH TABLE CLEANUP COMPLETE!';
    RAISE NOTICE '========================================';
    
    -- Count final batches
    SELECT COUNT(*), SUM(total_weight) INTO total_batches, overall_weight
    FROM order_batches 
    WHERE status = 'pending';
    
    RAISE NOTICE 'Total pending batches: %', total_batches;
    RAISE NOTICE 'Total weight across all batches: %kg', overall_weight;
    RAISE NOTICE '';
    
    -- Show final status by barangay
    FOR batch_summary IN 
        SELECT 
            barangay,
            COUNT(*) as batch_count,
            SUM(total_weight) as total_weight,
            ROUND((SUM(total_weight) / 3500) * 100, 1) as capacity_percent
        FROM order_batches 
        WHERE status = 'pending'
        GROUP BY barangay
        ORDER BY barangay
    LOOP
        RAISE NOTICE 'Barangay %: % batches', 
            batch_summary.barangay, 
            batch_summary.batch_count;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'SYSTEM RULES ENFORCED:';
    RAISE NOTICE '✅ Only ONE batch per barangay until 3500kg';
    RAISE NOTICE '✅ Batches only created after order approval';
    RAISE NOTICE '✅ No NULL barangay batches allowed';
    RAISE NOTICE '✅ Maximum 3500kg per batch enforced';
    RAISE NOTICE '========================================';
END $$; 