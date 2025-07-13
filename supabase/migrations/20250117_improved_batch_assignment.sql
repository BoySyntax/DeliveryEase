-- Improved batch assignment logic to fill existing batches before creating new ones
-- This fixes the issue where orders create new batches instead of using available capacity

DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;

-- Create improved batch assignment function
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_area text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    remaining_capacity decimal;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Log the delivery_address for debugging
        RAISE NOTICE 'Processing order % with delivery_address: %', NEW.id, NEW.delivery_address;
        
        -- Use a simplified area identifier for logging
        order_area := COALESCE(
            NEW.delivery_address->>'street_address',
            'Default Area'
        );
        
        RAISE NOTICE 'Processing order for area: %', order_area;

        -- Calculate order weight if not set
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
            RAISE NOTICE 'Calculated weight for order %: % kg', NEW.id, calculated_weight;
        END IF;

        -- PRIORITY 1: Find ANY existing batch with available capacity
        -- Remove area restrictions to maximize batch utilization
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'  -- Only pending batches (not assigned to drivers)
        AND b.total_weight + NEW.total_weight <= b.max_weight  -- Order must fit
        AND b.total_weight < b.max_weight  -- Batch not at full capacity
        ORDER BY 
            -- Prioritize batches with most remaining space for optimal packing
            (b.max_weight - b.total_weight) DESC,
            -- Then by creation time (older batches first)
            b.created_at ASC
        LIMIT 1;

        IF current_batch_id IS NOT NULL THEN
            remaining_capacity := (batch_total_weight + NEW.total_weight);
            RAISE NOTICE '✅ Found existing batch: %, adding %.2fkg (new total: %.2fkg/%.0fkg)', 
                        current_batch_id, NEW.total_weight, remaining_capacity, 3500;
        END IF;

        -- PRIORITY 2: Only create new batch if no existing batch can accommodate the order
        IF current_batch_id IS NULL THEN
            RAISE NOTICE '🆕 No suitable existing batch found, creating new batch for %.2fkg order', NEW.total_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_area, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE '✅ Created new batch with id: %', current_batch_id;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE '📦 Updated batch % - new total weight: %.2fkg', current_batch_id, batch_total_weight + NEW.total_weight;
            
            -- Check if batch is now at or near capacity
            IF (batch_total_weight + NEW.total_weight) >= 3500 THEN
                RAISE NOTICE '🚚 Batch % has reached capacity (%.1fkg/3500kg) - ready for driver assignment!', 
                            current_batch_id, batch_total_weight + NEW.total_weight;
            ELSIF (batch_total_weight + NEW.total_weight) >= 3000 THEN
                RAISE NOTICE '⚠️  Batch % is near capacity (%.1fkg/3500kg)', 
                            current_batch_id, batch_total_weight + NEW.total_weight;
            END IF;
        END IF;

        -- Assign the order to the batch
        NEW.batch_id := current_batch_id;
        RAISE NOTICE '🎯 Order % assigned to batch %', NEW.id, current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- Create helper function to manually rebalance batches if needed
CREATE OR REPLACE FUNCTION rebalance_pending_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_record RECORD;
    source_batch_id uuid;
    target_batch_id uuid;
    moved_orders INTEGER := 0;
BEGIN
    -- Look for opportunities to consolidate pending batches
    FOR batch_record IN 
        SELECT id, total_weight, max_weight, (max_weight - total_weight) as available_capacity
        FROM order_batches 
        WHERE status = 'pending' 
        AND total_weight < max_weight
        ORDER BY total_weight ASC  -- Start with least full batches
    LOOP
        -- Try to move orders from other batches to fill this one
        FOR order_record IN
            SELECT o.id, o.total_weight, o.batch_id
            FROM orders o
            JOIN order_batches b ON b.id = o.batch_id
            WHERE b.status = 'pending'
            AND b.id != batch_record.id
            AND o.total_weight <= batch_record.available_capacity
            AND o.approval_status = 'approved'
            ORDER BY o.total_weight DESC  -- Move largest orders first
        LOOP
            -- Move the order to the target batch
            UPDATE orders 
            SET batch_id = batch_record.id 
            WHERE id = order_record.id;
            
            -- Update batch weights
            UPDATE order_batches 
            SET total_weight = total_weight + order_record.total_weight 
            WHERE id = batch_record.id;
            
            UPDATE order_batches 
            SET total_weight = total_weight - order_record.total_weight 
            WHERE id = order_record.batch_id;
            
            moved_orders := moved_orders + 1;
            
            -- Update available capacity
            batch_record.available_capacity := batch_record.available_capacity - order_record.total_weight;
            
            -- Stop if batch is now full
            EXIT WHEN batch_record.available_capacity < 10;
        END LOOP;
    END LOOP;
    
    -- Clean up empty batches
    DELETE FROM order_batches 
    WHERE status = 'pending' 
    AND total_weight = 0 
    AND NOT EXISTS (
        SELECT 1 FROM orders WHERE batch_id = order_batches.id
    );
    
    RETURN FORMAT('Rebalanced %s orders and cleaned up empty batches', moved_orders);
END;
$$ LANGUAGE plpgsql;

-- Log completion
SELECT 'Improved batch assignment logic applied - orders will now fill existing batches before creating new ones' as status; 