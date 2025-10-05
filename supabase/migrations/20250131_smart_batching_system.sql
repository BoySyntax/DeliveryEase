-- Smart Batching System Migration
-- Implements minimum 3500kg threshold and maximum 5000kg capacity
-- Batches are auto-assigned for delivery once they reach 3500kg minimum

-- Drop existing triggers and functions to replace them
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
DROP TRIGGER IF EXISTS auto_consolidate_batches_trigger ON order_batches;
DROP FUNCTION IF EXISTS batch_approved_orders() CASCADE;
DROP FUNCTION IF EXISTS consolidate_underweight_batches() CASCADE;
DROP FUNCTION IF EXISTS fix_overweight_batches() CASCADE;
DROP FUNCTION IF EXISTS auto_consolidate_batches() CASCADE;

-- Create the smart batching function
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    min_weight_threshold decimal := 3500;  -- Minimum weight to assign batch
    max_weight_capacity decimal := 5000;   -- Maximum capacity per batch
    batch_status text;
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

        -- Validate weight is positive
        IF NEW.total_weight <= 0 THEN
            RAISE EXCEPTION 'Order % has invalid weight: %', NEW.id, NEW.total_weight;
        END IF;

        -- Find an existing pending batch for this barangay that has capacity for this order
        SELECT b.id, b.total_weight, b.status
        INTO current_batch_id, batch_total_weight, batch_status
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= max_weight_capacity
        ORDER BY (max_weight_capacity - b.total_weight) DESC, b.created_at ASC
        LIMIT 1;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, max_weight_capacity, 'pending')
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE '🆕 Created new batch % for barangay % (order weight: %kg)', 
                current_batch_id, order_barangay, NEW.total_weight;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE '✅ Added order % to existing batch % (total weight: %kg)', 
                NEW.id, current_batch_id, batch_total_weight + NEW.total_weight;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;

        -- Check if batch should be auto-assigned for delivery
        -- (This will be handled by the auto-assignment trigger)
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Create function to auto-assign batches when they reach minimum threshold
CREATE OR REPLACE FUNCTION auto_assign_ready_batches()
RETURNS TRIGGER AS $$
DECLARE
    batch_record RECORD;
    min_weight_threshold decimal := 3500;
    assigned_count INTEGER := 0;
BEGIN
    -- Find batches that have reached the minimum threshold and are still pending
    FOR batch_record IN 
        SELECT id, barangay, total_weight
        FROM order_batches 
        WHERE status = 'pending' 
        AND total_weight >= min_weight_threshold
    LOOP
        -- Update batch status to 'ready_for_delivery'
        UPDATE order_batches 
        SET status = 'ready_for_delivery'
        WHERE id = batch_record.id;
        
        assigned_count := assigned_count + 1;
        
        RAISE NOTICE '🚚 Auto-assigned batch % for delivery (weight: %kg >= %kg threshold)', 
            batch_record.id, batch_record.total_weight, min_weight_threshold;
    END LOOP;
    
    IF assigned_count > 0 THEN
        RAISE NOTICE 'Auto-assigned % batches for delivery', assigned_count;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create function to consolidate underweight batches from same barangay
CREATE OR REPLACE FUNCTION consolidate_underweight_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    source_batch_id uuid;
    target_batch_id uuid;
    source_weight decimal;
    target_weight decimal;
    merged_count INTEGER := 0;
    max_weight_capacity decimal := 5000;
    min_weight_threshold decimal := 3500;
BEGIN
    -- For each barangay, try to consolidate batches that are under the weight threshold
    FOR batch_record IN 
        SELECT DISTINCT barangay
        FROM order_batches 
        WHERE status = 'pending'
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        -- Find pairs of batches that can be merged
        WHILE EXISTS (
            SELECT 1 FROM order_batches 
            WHERE status = 'pending' 
            AND barangay = batch_record.barangay 
            GROUP BY barangay 
            HAVING COUNT(*) > 1
        ) LOOP
            -- Find two batches that can be merged (combined weight <= max_weight_capacity)
            SELECT b1.id, b1.total_weight, b2.id, b2.total_weight
            INTO source_batch_id, source_weight, target_batch_id, target_weight
            FROM order_batches b1, order_batches b2
            WHERE b1.status = 'pending' 
            AND b2.status = 'pending'
            AND b1.barangay = batch_record.barangay
            AND b2.barangay = batch_record.barangay
            AND b1.id != b2.id
            AND b1.total_weight + b2.total_weight <= max_weight_capacity
            ORDER BY b1.total_weight + b2.total_weight ASC
            LIMIT 1;
            
            -- If we found batches to merge
            IF source_batch_id IS NOT NULL AND target_batch_id IS NOT NULL THEN
                -- Move all orders from source to target
                UPDATE orders SET batch_id = target_batch_id WHERE batch_id = source_batch_id;
                
                -- Update target batch weight
                UPDATE order_batches 
                SET total_weight = source_weight + target_weight 
                WHERE id = target_batch_id;
                
                -- Delete the source batch
                DELETE FROM order_batches WHERE id = source_batch_id;
                
                merged_count := merged_count + 1;
                
                RAISE NOTICE '🔄 Merged batch % (%kg) into batch % (%kg) = %kg total', 
                    source_batch_id, source_weight, target_batch_id, target_weight, 
                    source_weight + target_weight;
            ELSE
                -- No more batches can be merged for this barangay
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
    
    IF merged_count > 0 THEN
        RETURN format('Successfully merged %s batch pairs', merged_count);
    ELSE
        RETURN 'No batches could be merged';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to fix any batches that exceed the maximum capacity
CREATE OR REPLACE FUNCTION fix_overweight_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_record RECORD;
    new_batch_id uuid;
    current_weight decimal := 0;
    max_weight_capacity decimal := 5000;
    fixed_count INTEGER := 0;
    original_batch_weight decimal;
BEGIN
    -- Find batches that exceed the maximum capacity
    FOR batch_record IN 
        SELECT id, barangay, total_weight
        FROM order_batches 
        WHERE status = 'pending' 
        AND total_weight > max_weight_capacity
    LOOP
        current_weight := 0;
        original_batch_weight := batch_record.total_weight;
        
        -- Get all orders in this batch, ordered by creation date
        FOR order_record IN 
            SELECT id, total_weight
            FROM orders 
            WHERE batch_id = batch_record.id
            ORDER BY created_at ASC
        LOOP
            -- If adding this order would exceed the limit, create a new batch
            IF current_weight + order_record.total_weight > max_weight_capacity THEN
                -- Create new batch for remaining orders
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (batch_record.barangay, order_record.total_weight, max_weight_capacity, 'pending')
                RETURNING id INTO new_batch_id;
                
                -- Move this order to the new batch
                UPDATE orders 
                SET batch_id = new_batch_id
                WHERE id = order_record.id;
                
                current_weight := order_record.total_weight;
                fixed_count := fixed_count + 1;
                
                RAISE NOTICE '🔧 Moved order % (%kg) to new batch %', 
                    order_record.id, order_record.total_weight, new_batch_id;
            ELSE
                -- Add to current batch
                current_weight := current_weight + order_record.total_weight;
            END IF;
        END LOOP;
        
        -- Update the original batch weight
        UPDATE order_batches 
        SET total_weight = current_weight
        WHERE id = batch_record.id;
        
        RAISE NOTICE '🔧 Fixed overweight batch %: %kg -> %kg', 
            batch_record.id, original_batch_weight, current_weight;
    END LOOP;
    
    IF fixed_count > 0 THEN
        RETURN format('Fixed %s overweight batches', fixed_count);
    ELSE
        RETURN 'No overweight batches found';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up empty batches
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

-- Create triggers
CREATE TRIGGER batch_approved_orders_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- Trigger to auto-assign batches when they reach minimum threshold
CREATE TRIGGER auto_assign_ready_batches_trigger
    AFTER INSERT OR UPDATE ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_ready_batches();

-- Run cleanup functions to fix any existing issues
SELECT fix_overweight_batches();
SELECT consolidate_underweight_batches();
SELECT cleanup_empty_batches();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_order_batches_barangay_status ON order_batches(barangay, status);
CREATE INDEX IF NOT EXISTS idx_order_batches_total_weight ON order_batches(total_weight);
CREATE INDEX IF NOT EXISTS idx_order_batches_status_weight ON order_batches(status, total_weight);
CREATE INDEX IF NOT EXISTS idx_orders_batch_id_approval ON orders(batch_id, approval_status);

-- Add comments to document the smart batching logic
COMMENT ON FUNCTION batch_approved_orders() IS 'Smart batching: assigns orders to batches with 3500kg minimum threshold and 5000kg maximum capacity';
COMMENT ON FUNCTION auto_assign_ready_batches() IS 'Auto-assigns batches for delivery when they reach 3500kg minimum threshold';
COMMENT ON FUNCTION consolidate_underweight_batches() IS 'Consolidates batches from same barangay that are under 5000kg maximum capacity';
COMMENT ON FUNCTION fix_overweight_batches() IS 'Fixes batches that exceed 5000kg maximum capacity by creating new batches';
