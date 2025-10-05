-- ADDRESS-BASED BATCHING: Batch orders based on their delivery address barangay
-- Simple and direct solution that extracts barangay from order address

-- Step 1: Create function to extract barangay from order address
CREATE OR REPLACE FUNCTION get_barangay_from_address(delivery_address jsonb)
RETURNS text AS $$
DECLARE
    full_address text;
    address_parts text[];
    part text;
    i int;
    array_len int;
BEGIN
    -- Get the full address from the order
    full_address := COALESCE(delivery_address->>'address', '');
    
    IF full_address = '' THEN
        RETURN 'Unknown Location';
    END IF;
    
    -- Split address by comma
    address_parts := string_to_array(full_address, ',');
    array_len := array_length(address_parts, 1);
    
    -- Look through address parts (start from the end, as barangay is usually near the end)
    i := array_len;
    WHILE i >= 1 LOOP
        part := trim(address_parts[i]);
        
        IF part != '' THEN
            -- Skip common non-barangay parts
            IF part ILIKE '%city%' OR part ILIKE '%philippines%' OR part ILIKE '%province%' OR 
               (part ILIKE '%misamis%' AND part ILIKE '%oriental%') THEN
                -- Skip city, country, province
                NULL;
            ELSIF part ILIKE '%barangay%' OR part ILIKE '%brgy%' THEN
                -- Extract barangay name (remove "barangay" or "brgy" prefix)
                part := regexp_replace(part, '^(barangay|brgy)\s*', '', 'gi');
                part := trim(part);
                IF part != '' THEN
                    RETURN part;
                END IF;
            ELSIF length(part) > 2 AND length(part) < 50 THEN
                -- This could be a barangay name
                IF part ~* '^[A-Za-z\s\-\.,]+$' AND part NOT ILIKE '%street%' AND part NOT ILIKE '%road%' THEN
                    RETURN part;
                END IF;
            END IF;
        END IF;
        
        i := i - 1;
    END LOOP;
    
    -- If no barangay found, return the last part of the address
    IF array_len > 0 THEN
        part := trim(address_parts[array_len]);
        IF part != '' AND part NOT ILIKE '%philippines%' THEN
            RETURN part;
        END IF;
    END IF;
    
    RETURN 'Unknown Location';
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create the batching function that uses address-based barangay detection
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    min_weight_threshold decimal := 3500;  -- Minimum weight to assign batch
    max_weight_capacity decimal := 5000;   -- Maximum capacity per batch
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- EXTRACT BARANGAY FROM ORDER ADDRESS
        order_barangay := get_barangay_from_address(NEW.delivery_address);
        
        -- Log the detected barangay
        RAISE NOTICE '📍 ORDER % ADDRESS: %', NEW.id, NEW.delivery_address->>'address';
        RAISE NOTICE '📍 DETECTED BARANGAY: %', order_barangay;

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
            NEW.total_weight := 1;
        END IF;

        -- Find an existing pending batch for this barangay that has capacity for this order
        SELECT b.id, b.total_weight
        INTO current_batch_id, batch_total_weight
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
            
            RAISE NOTICE '🆕 CREATED NEW BATCH % for barangay: %', current_batch_id, order_barangay;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE '📦 ADDED ORDER % to existing batch % (barangay: %)', 
                NEW.id, current_batch_id, order_barangay;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
        
        RAISE NOTICE '✅ ORDER % BATCHED successfully with barangay: %', NEW.id, order_barangay;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error batching order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create function to auto-assign batches when they reach minimum threshold
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
        
        RAISE NOTICE '🚚 AUTO-ASSIGNED BATCH % for delivery (barangay: %, weight: %kg)', 
            batch_record.id, batch_record.barangay, batch_record.total_weight;
    END LOOP;
    
    IF assigned_count > 0 THEN
        RAISE NOTICE 'Auto-assigned % batches for delivery', assigned_count;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create function to fix existing batches based on their order addresses
CREATE OR REPLACE FUNCTION fix_existing_batches_by_address()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_record RECORD;
    detected_barangay text;
    fixed_count INTEGER := 0;
BEGIN
    -- Find all batches that need fixing
    FOR batch_record IN 
        SELECT id, barangay
        FROM order_batches 
        WHERE status IN ('pending', 'ready_for_delivery')
        AND (barangay = 'Unknown' OR barangay = 'Unknown Location' OR barangay IS NULL)
    LOOP
        -- Get the first order in this batch to extract barangay from its address
        SELECT o.delivery_address
        INTO order_record
        FROM orders o
        WHERE o.batch_id = batch_record.id
        LIMIT 1;
        
        IF order_record.delivery_address IS NOT NULL THEN
            -- Extract barangay from the order's address
            detected_barangay := get_barangay_from_address(order_record.delivery_address);
            
            -- Update the batch with the detected barangay
            IF detected_barangay != 'Unknown Location' THEN
                UPDATE order_batches 
                SET barangay = detected_barangay
                WHERE id = batch_record.id;
                
                fixed_count := fixed_count + 1;
                RAISE NOTICE '✅ FIXED BATCH % based on order address: % -> %', 
                    batch_record.id, batch_record.barangay, detected_barangay;
            END IF;
        END IF;
    END LOOP;
    
    RETURN format('Fixed %s batches based on order addresses', fixed_count);
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create triggers
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
CREATE TRIGGER batch_approved_orders_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

DROP TRIGGER IF EXISTS auto_assign_ready_batches_trigger ON order_batches;
CREATE TRIGGER auto_assign_ready_batches_trigger
    AFTER INSERT OR UPDATE ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_ready_batches();

-- Step 6: Fix all existing batches based on their order addresses
SELECT fix_existing_batches_by_address();

-- Step 7: Add comments
COMMENT ON FUNCTION get_barangay_from_address(jsonb) IS 'Extracts barangay from order delivery address';
COMMENT ON FUNCTION batch_approved_orders() IS 'Batches orders based on barangay extracted from their delivery address';
COMMENT ON FUNCTION auto_assign_ready_batches() IS 'Auto-assigns batches for delivery when they reach 3500kg minimum threshold';
COMMENT ON FUNCTION fix_existing_batches_by_address() IS 'Fixes existing batches by extracting barangay from their order addresses';






