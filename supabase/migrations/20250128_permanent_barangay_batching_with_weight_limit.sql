-- Migration: Permanent fix for barangay-based batching with 3500kg weight limit
-- This ensures orders from the same barangay are batched together, but respects the weight limit

-- Drop the problematic constraint that prevents multiple batches per barangay
ALTER TABLE order_batches 
DROP CONSTRAINT IF EXISTS unique_pending_batch_per_barangay;

-- Update the batch assignment function to properly handle weight limits
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

        -- Find an existing batch for this barangay that has capacity for this order
        -- Prioritize batches with the most remaining space (but still under max capacity)
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= max_weight_limit
        ORDER BY (max_weight_limit - b.total_weight) DESC, b.created_at ASC
        LIMIT 1;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_barangay, NEW.total_weight, max_weight_limit)
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

-- Create a function to consolidate batches that are under the weight limit
CREATE OR REPLACE FUNCTION consolidate_underweight_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    source_batch_id uuid;
    target_batch_id uuid;
    source_weight decimal;
    target_weight decimal;
    merged_count INTEGER := 0;
    max_weight_limit decimal := 3500;
BEGIN
    -- For each barangay, try to consolidate batches that are under the weight limit
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
            -- Find two batches that can be merged (combined weight <= max_weight_limit)
            SELECT b1.id, b1.total_weight, b2.id, b2.total_weight
            INTO source_batch_id, source_weight, target_batch_id, target_weight
            FROM order_batches b1, order_batches b2
            WHERE b1.status = 'pending' 
            AND b2.status = 'pending'
            AND b1.barangay = batch_record.barangay
            AND b2.barangay = batch_record.barangay
            AND b1.id != b2.id
            AND b1.total_weight + b2.total_weight <= max_weight_limit
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

-- Create a function to fix any existing batches that exceed the weight limit
CREATE OR REPLACE FUNCTION fix_overweight_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_record RECORD;
    new_batch_id uuid;
    current_weight decimal := 0;
    max_weight_limit decimal := 3500;
    fixed_count INTEGER := 0;
    original_batch_weight decimal;
BEGIN
    -- Find batches that exceed the weight limit
    FOR batch_record IN 
        SELECT id, barangay, total_weight
        FROM order_batches 
        WHERE status = 'pending' 
        AND total_weight > max_weight_limit
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
            IF current_weight + order_record.total_weight > max_weight_limit THEN
                -- Create new batch for remaining orders
                INSERT INTO order_batches (barangay, total_weight, max_weight)
                VALUES (batch_record.barangay, order_record.total_weight, max_weight_limit)
                RETURNING id INTO new_batch_id;
                
                -- Move this order to the new batch
                UPDATE orders 
                SET batch_id = new_batch_id
                WHERE id = order_record.id;
                
                current_weight := order_record.total_weight;
                fixed_count := fixed_count + 1;
            ELSE
                -- Add to current batch
                current_weight := current_weight + order_record.total_weight;
            END IF;
        END LOOP;
        
        -- Update the original batch weight
        UPDATE order_batches 
        SET total_weight = current_weight
        WHERE id = batch_record.id;
    END LOOP;
    
    IF fixed_count > 0 THEN
        RETURN format('Fixed %s overweight batches', fixed_count);
    ELSE
        RETURN 'No overweight batches found';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a function to clean up empty batches
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

-- Create a function to automatically consolidate batches when needed
CREATE OR REPLACE FUNCTION auto_consolidate_batches()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is a new batch or an existing batch was updated, try to consolidate
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Consolidate batches for the same barangay if they can be merged
        PERFORM consolidate_underweight_batches();
        
        -- Fix any overweight batches that might have been created
        PERFORM fix_overweight_batches();
        
        -- Clean up any empty batches
        PERFORM cleanup_empty_batches();
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically consolidate batches
DROP TRIGGER IF EXISTS auto_consolidate_batches_trigger ON order_batches;
CREATE TRIGGER auto_consolidate_batches_trigger
    AFTER INSERT OR UPDATE ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION auto_consolidate_batches();

-- Run the cleanup functions to fix any existing issues
SELECT fix_overweight_batches();
SELECT consolidate_underweight_batches();
SELECT cleanup_empty_batches();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_order_batches_barangay_status ON order_batches(barangay, status);
CREATE INDEX IF NOT EXISTS idx_order_batches_total_weight ON order_batches(total_weight);
CREATE INDEX IF NOT EXISTS idx_orders_batch_id_approval ON orders(batch_id, approval_status);

-- Add a comment to document the batching logic
COMMENT ON FUNCTION batch_approved_orders() IS 'Automatically assigns approved orders to batches based on barangay location and 3500kg weight limit';
COMMENT ON FUNCTION consolidate_underweight_batches() IS 'Consolidates batches from the same barangay that are under the weight limit';
COMMENT ON FUNCTION fix_overweight_batches() IS 'Fixes batches that exceed the 3500kg weight limit by creating new batches'; 