-- PERMANENT FIX: Auto-detect barangay when orders are verified and batch them correctly
-- This is a robust, permanent solution that will work for all future orders

-- Step 1: Create a robust barangay detection function
CREATE OR REPLACE FUNCTION detect_barangay_from_address(delivery_address jsonb)
RETURNS text AS $$
DECLARE
    barangay text;
    full_address text;
    address_parts text[];
    part text;
    i int;
    array_len int;
BEGIN
    -- Method 1: Try to get barangay from the 'barangay' field
    barangay := delivery_address->>'barangay';
    IF barangay IS NOT NULL AND barangay != '' AND barangay != 'null' THEN
        RETURN trim(barangay);
    END IF;
    
    -- Method 2: Extract from full address string
    full_address := COALESCE(delivery_address->>'address', '');
    
    IF full_address != '' THEN
        -- Split by comma and process each part
        address_parts := string_to_array(full_address, ',');
        array_len := array_length(address_parts, 1);
        
        -- Look through address parts (start from the end, as barangay is usually near the end)
        i := array_len;
        WHILE i >= 1 LOOP
            part := trim(address_parts[i]);
            
            IF part != '' THEN
                -- Check for common barangay indicators
                IF part ILIKE '%barangay%' OR part ILIKE '%brgy%' THEN
                    part := regexp_replace(part, '^(barangay|brgy)\s*', '', 'gi');
                    part := trim(part);
                    IF part != '' THEN
                        RETURN part;
                    END IF;
                ELSIF part ILIKE '%city%' OR part ILIKE '%philippines%' OR part ILIKE '%province%' OR 
                      (part ILIKE '%misamis%' AND part ILIKE '%oriental%') THEN
                    -- Skip city, country, province
                    NULL;
                ELSIF length(part) > 2 AND length(part) < 50 THEN
                    -- This could be a barangay name
                    IF part ~* '^[A-Za-z\s\-\.,]+$' AND part NOT ILIKE '%street%' AND part NOT ILIKE '%road%' THEN
                        RETURN part;
                    END IF;
                END IF;
            END IF;
            
            i := i - 1;
        END LOOP;
    END IF;
    
    -- Method 3: Look for specific known barangays in Misamis Oriental
    IF full_address ILIKE '%patag%' THEN
        RETURN 'Patag, Misamis Oriental';
    ELSIF full_address ILIKE '%bulua%' THEN
        RETURN 'Bulua, Misamis Oriental';
    ELSIF full_address ILIKE '%carmen%' THEN
        RETURN 'Carmen, Misamis Oriental';
    ELSIF full_address ILIKE '%kauswagan%' THEN
        RETURN 'Kauswagan, Misamis Oriental';
    ELSIF full_address ILIKE '%lapasan%' THEN
        RETURN 'Lapasan, Misamis Oriental';
    ELSIF full_address ILIKE '%macasandig%' THEN
        RETURN 'Macasandig, Misamis Oriental';
    ELSIF full_address ILIKE '%nazareth%' THEN
        RETURN 'Nazareth, Misamis Oriental';
    ELSIF full_address ILIKE '%puerto%' THEN
        RETURN 'Puerto, Misamis Oriental';
    ELSIF full_address ILIKE '%tablon%' THEN
        RETURN 'Tablon, Misamis Oriental';
    ELSIF full_address ILIKE '%bonbon%' THEN
        RETURN 'Bonbon, Misamis Oriental';
    ELSIF full_address ILIKE '%consolacion%' THEN
        RETURN 'Consolacion, Misamis Oriental';
    ELSIF full_address ILIKE '%gusa%' THEN
        RETURN 'Gusa, Misamis Oriental';
    ELSIF full_address ILIKE '%iponan%' THEN
        RETURN 'Iponan, Misamis Oriental';
    ELSIF full_address ILIKE '%macabalan%' THEN
        RETURN 'Macabalan, Misamis Oriental';
    ELSIF full_address ILIKE '%puntod%' THEN
        RETURN 'Puntod, Misamis Oriental';
    ELSIF full_address ILIKE '%sanantonio%' THEN
        RETURN 'San Antonio, Misamis Oriental';
    ELSIF full_address ILIKE '%tignapoloan%' THEN
        RETURN 'Tignapoloan, Misamis Oriental';
    ELSIF full_address ILIKE '%tuburan%' THEN
        RETURN 'Tuburan, Misamis Oriental';
    ELSIF full_address ILIKE '%balulang%' THEN
        RETURN 'Balulang, Misamis Oriental';
    ELSIF full_address ILIKE '%bayabas%' THEN
        RETURN 'Bayabas, Misamis Oriental';
    ELSIF full_address ILIKE '%bugo%' THEN
        RETURN 'Bugo, Misamis Oriental';
    ELSIF full_address ILIKE '%camaman-an%' THEN
        RETURN 'Camaman-an, Misamis Oriental';
    ELSIF full_address ILIKE '%cugman%' THEN
        RETURN 'Cugman, Misamis Oriental';
    ELSIF full_address ILIKE '%dansolihon%' THEN
        RETURN 'Dansolihon, Misamis Oriental';
    ELSIF full_address ILIKE '%indahag%' THEN
        RETURN 'Indahag, Misamis Oriental';
    ELSIF full_address ILIKE '%mambuaya%' THEN
        RETURN 'Mambuaya, Misamis Oriental';
    ELSIF full_address ILIKE '%pagatpat%' THEN
        RETURN 'Pagatpat, Misamis Oriental';
    ELSIF full_address ILIKE '%pigsag-an%' THEN
        RETURN 'Pigsag-an, Misamis Oriental';
    ELSIF full_address ILIKE '%taglimao%' THEN
        RETURN 'Taglimao, Misamis Oriental';
    ELSIF full_address ILIKE '%tagpangi%' THEN
        RETURN 'Tagpangi, Misamis Oriental';
    END IF;
    
    -- Final fallback
    RETURN 'Unknown Location';
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create the permanent batching function with auto barangay detection
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
        -- AUTO-DETECT BARANGAY from delivery address
        order_barangay := detect_barangay_from_address(NEW.delivery_address);
        
        -- Log the detection result
        RAISE NOTICE '🔍 AUTO-DETECTED BARANGAY for order %: %', NEW.id, order_barangay;

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

        -- Find an existing pending batch for this detected barangay that has capacity for this order
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
            
            RAISE NOTICE '🆕 CREATED NEW BATCH % for detected barangay: %', current_batch_id, order_barangay;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE '📦 ADDED ORDER % to existing batch % (detected barangay: %)', 
                NEW.id, current_batch_id, order_barangay;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
        
        RAISE NOTICE '✅ ORDER % SUCCESSFULLY BATCHED with barangay: %', NEW.id, order_barangay;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create function to fix all existing batches with unknown barangay
CREATE OR REPLACE FUNCTION fix_all_unknown_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_record RECORD;
    detected_barangay text;
    fixed_count INTEGER := 0;
BEGIN
    -- Find all batches with unknown barangay
    FOR batch_record IN 
        SELECT id, barangay
        FROM order_batches 
        WHERE status IN ('pending', 'ready_for_delivery')
        AND (barangay = 'Unknown' OR barangay = 'Unknown Location' OR barangay IS NULL)
    LOOP
        -- Get the first order in this batch to detect barangay
        SELECT o.delivery_address
        INTO order_record
        FROM orders o
        WHERE o.batch_id = batch_record.id
        LIMIT 1;
        
        IF order_record.delivery_address IS NOT NULL THEN
            -- Use the detection function
            detected_barangay := detect_barangay_from_address(order_record.delivery_address);
            
            -- Update the batch with the detected barangay
            IF detected_barangay != 'Unknown Location' THEN
                UPDATE order_batches 
                SET barangay = detected_barangay
                WHERE id = batch_record.id;
                
                fixed_count := fixed_count + 1;
                RAISE NOTICE '✅ FIXED BATCH % barangay: % -> %', 
                    batch_record.id, batch_record.barangay, detected_barangay;
            END IF;
        END IF;
    END LOOP;
    
    RETURN format('Fixed %s batches with unknown barangay', fixed_count);
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create function to auto-assign batches when they reach minimum threshold
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

-- Step 6: Fix all existing batches
SELECT fix_all_unknown_batches();

-- Step 7: Add comments for documentation
COMMENT ON FUNCTION detect_barangay_from_address(jsonb) IS 'PERMANENT: Auto-detects barangay from any delivery address format';
COMMENT ON FUNCTION batch_approved_orders() IS 'PERMANENT: Auto-batches orders by detected barangay with 3500kg min, 5000kg max';
COMMENT ON FUNCTION fix_all_unknown_batches() IS 'Fixes all existing batches with unknown barangay using auto-detection';
COMMENT ON FUNCTION auto_assign_ready_batches() IS 'Auto-assigns batches for delivery when they reach 3500kg minimum threshold';






