-- Add better debugging to the batch assignment trigger
-- This will help us see exactly what the trigger is doing

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
        -- ENHANCED DEBUGGING - Log everything about the order
        RAISE NOTICE '=== BATCH ASSIGNMENT TRIGGER START ===';
        RAISE NOTICE 'Processing order ID: %', NEW.id;
        RAISE NOTICE 'Customer ID: %', NEW.customer_id;
        RAISE NOTICE 'Full delivery_address: %', NEW.delivery_address;
        
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        RAISE NOTICE 'Extracted barangay from delivery_address: "%"', order_barangay;
        
        -- ENHANCED DEBUGGING - Check what addresses this customer has
        RAISE NOTICE 'Customer addresses available:';
        FOR customer_address IN 
            SELECT a.id, a.barangay, a.full_name, a.created_at
            FROM addresses a 
            WHERE a.customer_id = NEW.customer_id 
            ORDER BY a.created_at DESC
        LOOP
            RAISE NOTICE '  Address ID: %, Barangay: %, Name: %, Created: %', 
                customer_address.id, customer_address.barangay, 
                customer_address.full_name, customer_address.created_at;
        END LOOP;
        
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
        END IF;

        -- Find an existing batch that:
        -- 1. Is pending (not assigned to driver yet)
        -- 2. Has orders from the same barangay
        -- 3. Has enough remaining capacity
        -- 4. Prioritize the batch that needs the LEAST additional weight to reach capacity
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY (b.max_weight - b.total_weight) ASC, b.created_at ASC
        LIMIT 1;

        RAISE NOTICE 'Found existing batch: %, total_weight: %', current_batch_id, batch_total_weight;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            RAISE NOTICE 'Creating new batch for barangay: "%" with weight: %', order_barangay, NEW.total_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_barangay, NEW.total_weight, 3500)
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE 'Created new batch with id: % for barangay: "%"', current_batch_id, order_barangay;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE 'Updated batch % with new total weight: %', current_batch_id, batch_total_weight + NEW.total_weight;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
        RAISE NOTICE 'Assigned order % to batch % with barangay "%"', NEW.id, current_batch_id, order_barangay;
        RAISE NOTICE '=== BATCH ASSIGNMENT TRIGGER END ===';
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- The trigger is already created, so we just need to update the function
