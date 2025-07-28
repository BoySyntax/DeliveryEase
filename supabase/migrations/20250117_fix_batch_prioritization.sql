-- Fix batch prioritization to prioritize the oldest batch first
-- and ensure proper weight calculation and capacity checking

-- Drop existing triggers and functions first
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
DROP FUNCTION IF EXISTS batch_approved_orders();

-- Drop and recreate the batch_approved_orders function with corrected prioritization
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Log the delivery_address for debugging
        RAISE NOTICE 'Processing order % with delivery_address: %', NEW.id, NEW.delivery_address;
        
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        RAISE NOTICE 'Extracted barangay: %', order_barangay;
        
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
            RAISE NOTICE 'Calculated weight for order %: %', NEW.id, calculated_weight;
        ELSE
            calculated_weight := NEW.total_weight;
            RAISE NOTICE 'Using existing weight for order %: %', NEW.id, calculated_weight;
        END IF;

        -- Find an existing batch that:
        -- 1. Is pending (not assigned to driver yet)
        -- 2. Has orders from the same barangay
        -- 3. Has enough remaining capacity
        -- 4. Prioritize the FIRST batch that was created (oldest first)
        
        -- Debug: Log all available batches for this barangay
        RAISE NOTICE 'Looking for batches in barangay: %', order_barangay;
        RAISE NOTICE 'Order weight: %, Max batch weight: 3500', calculated_weight;
        
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + calculated_weight <= b.max_weight
        ORDER BY b.created_at ASC
        LIMIT 1;

        RAISE NOTICE 'Selected batch: %, total_weight: %', current_batch_id, batch_total_weight;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            RAISE NOTICE 'Creating new batch for barangay: %, weight: %', order_barangay, calculated_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_barangay, calculated_weight, 3500)
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE 'Created new batch with id: %', current_batch_id;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + calculated_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE 'Updated batch % with new total weight: %', current_batch_id, batch_total_weight + calculated_weight;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
        RAISE NOTICE 'Assigned order % to batch %', NEW.id, current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Drop existing function first
DROP FUNCTION IF EXISTS recalculate_batch_weights();

-- Function to recalculate batch weights based on actual order items
CREATE OR REPLACE FUNCTION recalculate_batch_weights()
RETURNS void AS $$
DECLARE
    batch_record RECORD;
    calculated_weight decimal;
BEGIN
    -- Loop through all batches and recalculate their weights
    FOR batch_record IN 
        SELECT DISTINCT b.id, b.barangay
        FROM order_batches b
        WHERE b.status = 'pending'
    LOOP
        -- Calculate actual weight from order items
        SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
        INTO calculated_weight
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE o.batch_id = batch_record.id
        AND o.approval_status = 'approved';
        
        -- Update batch weight
        UPDATE order_batches 
        SET total_weight = calculated_weight
        WHERE id = batch_record.id;
        
        RAISE NOTICE 'Recalculated batch % weight: %', batch_record.id, calculated_weight;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Call the recalculation function to fix any existing weight discrepancies
SELECT recalculate_batch_weights();

-- Recreate the trigger
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders(); 