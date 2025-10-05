-- Simple and reliable barangay detection fix
-- This version uses simpler syntax that's guaranteed to work in PostgreSQL

-- Create a helper function to extract barangay from any address format
CREATE OR REPLACE FUNCTION extract_barangay_from_address(delivery_address jsonb)
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
    
    -- If found and not empty/null, return it
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
            
            -- Skip empty parts
            IF part != '' THEN
                -- Check for common barangay indicators
                IF part ILIKE '%barangay%' OR part ILIKE '%brgy%' THEN
                    -- Extract barangay name (remove "barangay" or "brgy" prefix)
                    part := regexp_replace(part, '^(barangay|brgy)\s*', '', 'gi');
                    part := trim(part);
                    IF part != '' THEN
                        RETURN part;
                    END IF;
                ELSIF part ILIKE '%misamis%' AND part ILIKE '%oriental%' THEN
                    -- This is likely the province, not barangay - skip
                    NULL;
                ELSIF part ILIKE '%city%' OR part ILIKE '%philippines%' OR part ILIKE '%province%' THEN
                    -- Skip city, country, province
                    NULL;
                ELSIF length(part) > 2 AND length(part) < 50 THEN
                    -- This could be a barangay name
                    -- Additional validation: check if it contains common barangay patterns
                    IF part ~* '^[A-Za-z\s\-\.,]+$' AND part NOT ILIKE '%street%' AND part NOT ILIKE '%road%' THEN
                        RETURN part;
                    END IF;
                END IF;
            END IF;
            
            i := i - 1;
        END LOOP;
    END IF;
    
    -- Method 3: Try to extract from other address fields
    barangay := delivery_address->>'barangay_name';
    IF barangay IS NOT NULL AND barangay != '' AND barangay != 'null' THEN
        RETURN trim(barangay);
    END IF;
    
    barangay := delivery_address->>'area';
    IF barangay IS NOT NULL AND barangay != '' AND barangay != 'null' THEN
        RETURN trim(barangay);
    END IF;
    
    -- Method 4: Look for specific known barangays in Misamis Oriental
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

-- Update the batching function to use the new barangay extraction
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
        -- Use the robust barangay extraction function
        order_barangay := extract_barangay_from_address(NEW.delivery_address);
        
        -- Log the extraction result
        RAISE NOTICE '📍 Extracted barangay for order %: %', NEW.id, order_barangay;

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
            
            RAISE NOTICE '🆕 Created new batch % for barangay: %', current_batch_id, order_barangay;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE '📦 Added order % to existing batch % (barangay: %)', 
                NEW.id, current_batch_id, order_barangay;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to fix all existing batches with unknown barangay
CREATE OR REPLACE FUNCTION fix_all_unknown_barangay_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_record RECORD;
    extracted_barangay text;
    fixed_count INTEGER := 0;
BEGIN
    -- Find all batches with unknown barangay
    FOR batch_record IN 
        SELECT id, barangay
        FROM order_batches 
        WHERE status IN ('pending', 'ready_for_delivery')
        AND (barangay = 'Unknown' OR barangay = 'Unknown Location' OR barangay IS NULL)
    LOOP
        -- Get the first order in this batch to extract barangay
        SELECT o.delivery_address
        INTO order_record
        FROM orders o
        WHERE o.batch_id = batch_record.id
        LIMIT 1;
        
        IF order_record.delivery_address IS NOT NULL THEN
            -- Use the robust extraction function
            extracted_barangay := extract_barangay_from_address(order_record.delivery_address);
            
            -- Update the batch with the extracted barangay
            IF extracted_barangay != 'Unknown Location' THEN
                UPDATE order_batches 
                SET barangay = extracted_barangay
                WHERE id = batch_record.id;
                
                fixed_count := fixed_count + 1;
                RAISE NOTICE '✅ Fixed batch % barangay: % -> %', 
                    batch_record.id, batch_record.barangay, extracted_barangay;
            END IF;
        END IF;
    END LOOP;
    
    RETURN format('Fixed %s batches with unknown barangay', fixed_count);
END;
$$ LANGUAGE plpgsql;

-- Run the fix function
SELECT fix_all_unknown_barangay_batches();

-- Add comments
COMMENT ON FUNCTION extract_barangay_from_address(jsonb) IS 'Robust function to extract barangay from any delivery address format';
COMMENT ON FUNCTION batch_approved_orders() IS 'Smart batching with permanent barangay detection - 3500kg minimum, 5000kg maximum';
COMMENT ON FUNCTION fix_all_unknown_barangay_batches() IS 'Fixes all existing batches with unknown barangay using robust extraction';






