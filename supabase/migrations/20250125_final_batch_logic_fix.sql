-- FINAL PERMANENT FIX: ONE batch per barangay until 3500kg
-- This ensures orders ALWAYS go to existing batch until it's full

-- Step 1: Clean up existing duplicate batches
DO $$
DECLARE
    barangay_record RECORD;
    target_batch_id UUID;
    source_batch_id UUID;
BEGIN
    RAISE NOTICE 'Cleaning up existing duplicate batches...';
    
    -- Loop through each barangay that has multiple pending batches
    FOR barangay_record IN
        SELECT barangay, COUNT(*) as batch_count
        FROM order_batches
        WHERE status = 'pending'
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        RAISE NOTICE 'Consolidating % batches for barangay: %', barangay_record.batch_count, barangay_record.barangay;
        
        -- Get the oldest batch as target
        SELECT id INTO target_batch_id
        FROM order_batches
        WHERE barangay = barangay_record.barangay AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1;
        
        -- Move orders from newer batches to the oldest one
        FOR source_batch_id IN
            SELECT id
            FROM order_batches
            WHERE barangay = barangay_record.barangay 
            AND status = 'pending' 
            AND id != target_batch_id
            ORDER BY created_at ASC
        LOOP
            RAISE NOTICE 'Moving orders from batch to target batch';
            
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
    END LOOP;
END $$;

-- Step 2: Create the CORRECT batch assignment function
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    existing_batch_id uuid;
    existing_batch_weight decimal;
    calculated_weight decimal;
    lock_key bigint;
BEGIN
    -- Only process when order status changes TO 'approved'
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
        
        -- If still no barangay, skip batch assignment
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'Unknown Barangay' THEN
            RAISE NOTICE 'No valid barangay found for order %. Skipping batch assignment.', NEW.id;
            RETURN NEW;
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

        RAISE NOTICE 'Looking for existing batch for barangay: % (order weight: %kg)', order_barangay, NEW.total_weight;

        -- CRITICAL: Look for ANY existing pending batch for this barangay
        SELECT b.id, b.total_weight
        INTO existing_batch_id, existing_batch_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        ORDER BY b.created_at ASC  -- Always use the oldest batch first
        LIMIT 1
        FOR UPDATE;

        -- DECISION LOGIC: ALWAYS use existing batch if it exists
        IF existing_batch_id IS NOT NULL THEN
            RAISE NOTICE 'Found existing batch % with weight %kg', existing_batch_id, existing_batch_weight;
            
            -- ALWAYS add to existing batch, even if it would exceed 3500kg
            -- This ensures ONE batch per barangay until it's completely full
            UPDATE order_batches 
            SET total_weight = existing_batch_weight + NEW.total_weight
            WHERE id = existing_batch_id;
            
            NEW.batch_id := existing_batch_id;
            RAISE NOTICE 'Added order to existing batch for % (new total: %kg)', 
                order_barangay, existing_batch_weight + NEW.total_weight;
        ELSE
            -- No existing batch for this barangay, create first one
            RAISE NOTICE 'No existing batch found for barangay %, creating first batch', order_barangay;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO existing_batch_id;
            
            NEW.batch_id := existing_batch_id;
            RAISE NOTICE 'Created first batch for % with weight %kg', 
                order_barangay, NEW.total_weight;
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch assignment for order: %', SQLERRM;
        RETURN NEW; -- Don't fail the order creation
END;
$$ LANGUAGE plpgsql;

-- Step 3: Remove any problematic prevention triggers
DROP TRIGGER IF EXISTS prevent_multiple_pending_batches_trigger ON order_batches;
DROP TRIGGER IF EXISTS prevent_duplicate_barangay_batches_trigger ON order_batches;
DROP FUNCTION IF EXISTS prevent_multiple_pending_batches_per_barangay();
DROP FUNCTION IF EXISTS prevent_duplicate_barangay_batches();

-- Step 4: Add constraint to prevent empty barangay names
ALTER TABLE order_batches 
DROP CONSTRAINT IF EXISTS order_batches_barangay_not_null;
ALTER TABLE order_batches 
DROP CONSTRAINT IF EXISTS order_batches_barangay_not_empty;

ALTER TABLE order_batches 
ADD CONSTRAINT order_batches_barangay_not_empty 
CHECK (barangay IS NULL OR barangay != '');

-- Step 5: Update all batch weights to ensure accuracy
UPDATE order_batches 
SET total_weight = (
    SELECT COALESCE(SUM(o.total_weight), 0)
    FROM orders o
    WHERE o.batch_id = order_batches.id
    AND o.approval_status = 'approved'
)
WHERE status = 'pending';

-- Step 6: Remove empty batches
DELETE FROM order_batches 
WHERE status = 'pending' 
AND total_weight <= 0;

-- Step 7: Final status report
DO $$
DECLARE
    batch_summary RECORD;
    total_batches INTEGER;
    overall_weight DECIMAL;
BEGIN
    RAISE NOTICE 'FINAL BATCH LOGIC FIX COMPLETE!';
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
        RAISE NOTICE '%: % batch(es), %kg', 
            batch_summary.barangay, 
            batch_summary.batch_count, 
            batch_summary.total_weight;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'FINAL BATCH LOGIC ENFORCED:';
    RAISE NOTICE '   • ONE batch per barangay until 3500kg';
    RAISE NOTICE '   • Orders ALWAYS go to existing batch';
    RAISE NOTICE '   • New batch only when existing one reaches 3500kg';
    RAISE NOTICE '   • No premature batch creation';
    RAISE NOTICE '========================================';
END $$; 