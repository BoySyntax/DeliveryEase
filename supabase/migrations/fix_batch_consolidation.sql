-- Fix batch consolidation for same barangay orders
-- This script consolidates existing batches from the same barangay and fixes the trigger

-- Step 1: Consolidate existing batches from Patag (and other barangays)
DO $$
DECLARE
    source_batch RECORD;
    target_batch RECORD;
    consolidation_count INTEGER := 0;
BEGIN
    RAISE NOTICE '🔧 Starting batch consolidation for same barangay orders...';
    
    -- Loop through each barangay that has multiple pending batches
    FOR source_batch IN 
        SELECT barangay, COUNT(*) as batch_count
        FROM order_batches 
        WHERE status = 'pending' 
        GROUP BY barangay 
        HAVING COUNT(*) > 1
        ORDER BY barangay
    LOOP
        RAISE NOTICE '📦 Found % pending batches for barangay: %', source_batch.batch_count, source_batch.barangay;
        
        -- Get all batches for this barangay ordered by creation date (keep oldest)
        FOR target_batch IN 
            SELECT * FROM order_batches 
            WHERE status = 'pending' 
            AND barangay = source_batch.barangay 
            ORDER BY created_at ASC
        LOOP
            -- For each batch except the first one, try to merge into earlier batches
            DECLARE
                earliest_batch RECORD;
                total_weight_check DECIMAL;
            BEGIN
                -- Find the earliest batch that can accommodate this batch's weight
                SELECT * INTO earliest_batch
                FROM order_batches 
                WHERE status = 'pending' 
                AND barangay = source_batch.barangay 
                AND id != target_batch.id
                AND created_at < target_batch.created_at
                AND total_weight + target_batch.total_weight <= max_weight
                ORDER BY created_at ASC
                LIMIT 1;
                
                -- If we found a suitable target batch, merge
                IF earliest_batch.id IS NOT NULL THEN
                    RAISE NOTICE '🔄 Merging batch % (%.2f kg) into batch % (%.2f kg) for barangay %', 
                        target_batch.id, target_batch.total_weight, 
                        earliest_batch.id, earliest_batch.total_weight,
                        source_batch.barangay;
                    
                    -- Move all orders from target_batch to earliest_batch
                    UPDATE orders 
                    SET batch_id = earliest_batch.id 
                    WHERE batch_id = target_batch.id;
                    
                    -- Update the earliest batch's total weight
                    UPDATE order_batches 
                    SET total_weight = earliest_batch.total_weight + target_batch.total_weight
                    WHERE id = earliest_batch.id;
                    
                    -- Delete the now-empty batch
                    DELETE FROM order_batches WHERE id = target_batch.id;
                    
                    consolidation_count := consolidation_count + 1;
                    
                    RAISE NOTICE '✅ Successfully merged batch. New total weight: %.2f kg', 
                        earliest_batch.total_weight + target_batch.total_weight;
                END IF;
            END;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE '🎯 Consolidation complete! Merged % duplicate batches', consolidation_count;
END $$;

-- Step 2: Update the batch assignment function to be more reliable
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;

CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    available_capacity decimal;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND (OLD.approval_status IS NULL OR OLD.approval_status != 'approved') THEN
        RAISE NOTICE '🚚 Processing order % for batch assignment...', NEW.id;
        
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        RAISE NOTICE '📍 Order barangay: %', order_barangay;
        
        IF order_barangay IS NULL OR order_barangay = '' THEN
            RAISE WARNING '❌ No barangay found in delivery address for order %. Delivery address: %', NEW.id, NEW.delivery_address;
            -- Set a default barangay or skip batching
            order_barangay := 'Unknown';
        END IF;

        -- Calculate order weight if not set
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
            RAISE NOTICE '⚖️ Calculated weight for order %: % kg', NEW.id, calculated_weight;
        END IF;

        -- Find an existing pending batch for the same barangay with available capacity
        -- Priority: batch with least remaining capacity (most efficient packing)
        SELECT b.id, b.total_weight, (b.max_weight - b.total_weight) as available_capacity
        INTO current_batch_id, batch_total_weight, available_capacity
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY (b.max_weight - b.total_weight) ASC, b.created_at ASC
        LIMIT 1;

        IF current_batch_id IS NOT NULL THEN
            RAISE NOTICE '✅ Found existing batch % for barangay %. Current weight: % kg, available capacity: % kg', 
                current_batch_id, order_barangay, batch_total_weight, available_capacity;
            
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE '🔄 Updated batch % with new total weight: % kg', 
                current_batch_id, batch_total_weight + NEW.total_weight;
        ELSE
            -- No suitable batch found, create a new one
            RAISE NOTICE '📦 Creating new batch for barangay: %, weight: % kg', order_barangay, NEW.total_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE '✨ Created new batch with id: %', current_batch_id;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
        RAISE NOTICE '🎯 Assigned order % to batch %', NEW.id, current_batch_id;
        
        -- Log final batch capacity
        SELECT total_weight, max_weight INTO batch_total_weight, available_capacity 
        FROM order_batches WHERE id = current_batch_id;
        
        RAISE NOTICE '📊 Batch % capacity: % / % kg (%.1f%%)', 
            current_batch_id, batch_total_weight, available_capacity,
            (batch_total_weight / available_capacity * 100);
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        -- Don't fail the order creation, just log the error
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- Step 3: Verify current batch status
DO $$
DECLARE
    batch_info RECORD;
BEGIN
    RAISE NOTICE '📋 Current batch status after consolidation:';
    RAISE NOTICE '================================================';
    
    FOR batch_info IN 
        SELECT 
            b.id,
            b.barangay,
            b.total_weight,
            b.max_weight,
            b.status,
            ROUND((b.total_weight / b.max_weight * 100)::numeric, 1) as capacity_percent,
            COUNT(o.id) as order_count,
            b.created_at
        FROM order_batches b
        LEFT JOIN orders o ON o.batch_id = b.id
        WHERE b.status = 'pending'
        GROUP BY b.id, b.barangay, b.total_weight, b.max_weight, b.status, b.created_at
        ORDER BY b.barangay, b.created_at
    LOOP
        RAISE NOTICE '📦 Batch %: % | % kg / % kg (%%%) | % orders | Created: %',
            batch_info.id,
            batch_info.barangay,
            batch_info.total_weight,
            batch_info.max_weight,
            batch_info.capacity_percent,
            batch_info.order_count,
            batch_info.created_at;
    END LOOP;
    
    RAISE NOTICE '================================================';
    
    -- Check for any duplicate barangays
    FOR batch_info IN 
        SELECT barangay, COUNT(*) as batch_count
        FROM order_batches 
        WHERE status = 'pending'
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        RAISE WARNING '⚠️ Still found % pending batches for barangay: %', batch_info.batch_count, batch_info.barangay;
    END LOOP;
END $$;

-- Success message
SELECT '🎉 Batch consolidation and trigger fix completed successfully!' as status; 