-- FIX: Extract barangay from frontend delivery_address structure
-- The frontend sends delivery_address with a 'barangay' field that needs to be read correctly

-- Step 1: Create function to extract barangay from frontend delivery_address structure
CREATE OR REPLACE FUNCTION extract_barangay_from_frontend_address(delivery_address jsonb)
RETURNS text AS $$
DECLARE
    barangay text;
    full_address text;
    address_parts text[];
    part text;
    i int;
    array_len int;
BEGIN
    -- Method 1: Try to get barangay from the 'barangay' field (frontend structure)
    barangay := delivery_address->>'barangay';
    
    RAISE NOTICE '🔍 EXTRACTING BARANGAY FROM FRONTEND ADDRESS: %', delivery_address;
    RAISE NOTICE '🔍 BARANGAY FIELD: %', barangay;
    
    -- If found and not empty/null, return it
    IF barangay IS NOT NULL AND barangay != '' AND barangay != 'null' THEN
        RAISE NOTICE '✅ FOUND BARANGAY IN BARANGAY FIELD: %', barangay;
        RETURN trim(barangay);
    END IF;
    
    -- Method 2: Try to get from 'address' field (full address string)
    full_address := COALESCE(delivery_address->>'address', '');
    
    IF full_address != '' THEN
        RAISE NOTICE '🔍 CHECKING FULL ADDRESS: %', full_address;
        
        -- Split by comma
        address_parts := string_to_array(full_address, ',');
        array_len := array_length(address_parts, 1);
        
        RAISE NOTICE '🔍 ADDRESS PARTS COUNT: %', array_len;
        
        -- Look through each part (from end to beginning)
        i := array_len;
        WHILE i >= 1 LOOP
            part := trim(address_parts[i]);
            RAISE NOTICE '🔍 CHECKING PART %: "%"', i, part;
            
            IF part != '' THEN
                -- Skip obvious non-barangay parts
                IF part ILIKE '%city%' OR part ILIKE '%philippines%' OR part ILIKE '%province%' OR 
                   part ILIKE '%misamis oriental%' OR part ILIKE '%cagayan de oro%' THEN
                    RAISE NOTICE '⏭️ SKIPPING: %', part;
                ELSIF part ILIKE '%barangay%' OR part ILIKE '%brgy%' THEN
                    -- Extract barangay name
                    barangay := regexp_replace(part, '^(barangay|brgy)\s*', '', 'gi');
                    barangay := trim(barangay);
                    RAISE NOTICE '✅ FOUND BARANGAY IN ADDRESS: %', barangay;
                    IF barangay != '' THEN
                        RETURN barangay;
                    END IF;
                ELSIF length(part) > 2 AND length(part) < 50 THEN
                    -- This could be a barangay name
                    IF part ~* '^[A-Za-z\s\-\.,]+$' AND part NOT ILIKE '%street%' AND part NOT ILIKE '%road%' THEN
                        RAISE NOTICE '✅ FOUND POTENTIAL BARANGAY: %', part;
                        RETURN part;
                    END IF;
                END IF;
            END IF;
            
            i := i - 1;
        END LOOP;
    END IF;
    
    -- Method 3: Try other possible fields
    barangay := delivery_address->>'area';
    IF barangay IS NOT NULL AND barangay != '' AND barangay != 'null' THEN
        RAISE NOTICE '✅ FOUND BARANGAY IN AREA FIELD: %', barangay;
        RETURN trim(barangay);
    END IF;
    
    barangay := delivery_address->>'location';
    IF barangay IS NOT NULL AND barangay != '' AND barangay != 'null' THEN
        RAISE NOTICE '✅ FOUND BARANGAY IN LOCATION FIELD: %', barangay;
        RETURN trim(barangay);
    END IF;
    
    -- Method 4: Look for specific known barangays
    IF full_address ILIKE '%patag%' THEN
        RAISE NOTICE '✅ FOUND PATAG IN ADDRESS';
        RETURN 'Patag, Misamis Oriental';
    ELSIF full_address ILIKE '%bulua%' THEN
        RAISE NOTICE '✅ FOUND BULUA IN ADDRESS';
        RETURN 'Bulua, Misamis Oriental';
    ELSIF full_address ILIKE '%carmen%' THEN
        RAISE NOTICE '✅ FOUND CARMEN IN ADDRESS';
        RETURN 'Carmen, Misamis Oriental';
    ELSIF full_address ILIKE '%kauswagan%' THEN
        RAISE NOTICE '✅ FOUND KAUSWAGAN IN ADDRESS';
        RETURN 'Kauswagan, Misamis Oriental';
    ELSIF full_address ILIKE '%lapasan%' THEN
        RAISE NOTICE '✅ FOUND LAPASAN IN ADDRESS';
        RETURN 'Lapasan, Misamis Oriental';
    ELSIF full_address ILIKE '%macasandig%' THEN
        RAISE NOTICE '✅ FOUND MACASANDIG IN ADDRESS';
        RETURN 'Macasandig, Misamis Oriental';
    ELSIF full_address ILIKE '%nazareth%' THEN
        RAISE NOTICE '✅ FOUND NAZARETH IN ADDRESS';
        RETURN 'Nazareth, Misamis Oriental';
    ELSIF full_address ILIKE '%puerto%' THEN
        RAISE NOTICE '✅ FOUND PUERTO IN ADDRESS';
        RETURN 'Puerto, Misamis Oriental';
    ELSIF full_address ILIKE '%tablon%' THEN
        RAISE NOTICE '✅ FOUND TABLON IN ADDRESS';
        RETURN 'Tablon, Misamis Oriental';
    ELSIF full_address ILIKE '%bonbon%' THEN
        RAISE NOTICE '✅ FOUND BONBON IN ADDRESS';
        RETURN 'Bonbon, Misamis Oriental';
    ELSIF full_address ILIKE '%consolacion%' THEN
        RAISE NOTICE '✅ FOUND CONSOLACION IN ADDRESS';
        RETURN 'Consolacion, Misamis Oriental';
    ELSIF full_address ILIKE '%gusa%' THEN
        RAISE NOTICE '✅ FOUND GUSA IN ADDRESS';
        RETURN 'Gusa, Misamis Oriental';
    ELSIF full_address ILIKE '%iponan%' THEN
        RAISE NOTICE '✅ FOUND IPONAN IN ADDRESS';
        RETURN 'Iponan, Misamis Oriental';
    ELSIF full_address ILIKE '%macabalan%' THEN
        RAISE NOTICE '✅ FOUND MACABALAN IN ADDRESS';
        RETURN 'Macabalan, Misamis Oriental';
    ELSIF full_address ILIKE '%puntod%' THEN
        RAISE NOTICE '✅ FOUND PUNTOD IN ADDRESS';
        RETURN 'Puntod, Misamis Oriental';
    ELSIF full_address ILIKE '%sanantonio%' THEN
        RAISE NOTICE '✅ FOUND SAN ANTONIO IN ADDRESS';
        RETURN 'San Antonio, Misamis Oriental';
    ELSIF full_address ILIKE '%tignapoloan%' THEN
        RAISE NOTICE '✅ FOUND TIGNAPOLOAN IN ADDRESS';
        RETURN 'Tignapoloan, Misamis Oriental';
    ELSIF full_address ILIKE '%tuburan%' THEN
        RAISE NOTICE '✅ FOUND TUBURAN IN ADDRESS';
        RETURN 'Tuburan, Misamis Oriental';
    ELSIF full_address ILIKE '%balulang%' THEN
        RAISE NOTICE '✅ FOUND BALULANG IN ADDRESS';
        RETURN 'Balulang, Misamis Oriental';
    ELSIF full_address ILIKE '%bayabas%' THEN
        RAISE NOTICE '✅ FOUND BAYABAS IN ADDRESS';
        RETURN 'Bayabas, Misamis Oriental';
    ELSIF full_address ILIKE '%bugo%' THEN
        RAISE NOTICE '✅ FOUND BUGO IN ADDRESS';
        RETURN 'Bugo, Misamis Oriental';
    ELSIF full_address ILIKE '%camaman-an%' THEN
        RAISE NOTICE '✅ FOUND CAMAMAN-AN IN ADDRESS';
        RETURN 'Camaman-an, Misamis Oriental';
    ELSIF full_address ILIKE '%cugman%' THEN
        RAISE NOTICE '✅ FOUND CUGMAN IN ADDRESS';
        RETURN 'Cugman, Misamis Oriental';
    ELSIF full_address ILIKE '%dansolihon%' THEN
        RAISE NOTICE '✅ FOUND DANSOLIHON IN ADDRESS';
        RETURN 'Dansolihon, Misamis Oriental';
    ELSIF full_address ILIKE '%indahag%' THEN
        RAISE NOTICE '✅ FOUND INDAHAG IN ADDRESS';
        RETURN 'Indahag, Misamis Oriental';
    ELSIF full_address ILIKE '%mambuaya%' THEN
        RAISE NOTICE '✅ FOUND MAMBUAYA IN ADDRESS';
        RETURN 'Mambuaya, Misamis Oriental';
    ELSIF full_address ILIKE '%pagatpat%' THEN
        RAISE NOTICE '✅ FOUND PAGATPAT IN ADDRESS';
        RETURN 'Pagatpat, Misamis Oriental';
    ELSIF full_address ILIKE '%pigsag-an%' THEN
        RAISE NOTICE '✅ FOUND PIGSAG-AN IN ADDRESS';
        RETURN 'Pigsag-an, Misamis Oriental';
    ELSIF full_address ILIKE '%taglimao%' THEN
        RAISE NOTICE '✅ FOUND TAGLIMAO IN ADDRESS';
        RETURN 'Taglimao, Misamis Oriental';
    ELSIF full_address ILIKE '%tagpangi%' THEN
        RAISE NOTICE '✅ FOUND TAGPANGI IN ADDRESS';
        RETURN 'Tagpangi, Misamis Oriental';
    END IF;
    
    RAISE NOTICE '❌ NO BARANGAY FOUND, USING UNKNOWN';
    RETURN 'Unknown Location';
END;
$$ LANGUAGE plpgsql;

-- Step 2: Update the batching function to use the frontend-compatible extraction
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    min_weight_threshold decimal := 3500;
    max_weight_capacity decimal := 5000;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        RAISE NOTICE '🔄 PROCESSING ORDER % FOR BATCHING', NEW.id;
        RAISE NOTICE '📍 ORDER DELIVERY ADDRESS: %', NEW.delivery_address;
        
        -- EXTRACT BARANGAY FROM FRONTEND DELIVERY ADDRESS STRUCTURE
        order_barangay := extract_barangay_from_frontend_address(NEW.delivery_address);
        
        RAISE NOTICE '📍 DETECTED BARANGAY: %', order_barangay;

        -- Calculate order weight
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
        END IF;

        IF NEW.total_weight <= 0 THEN
            NEW.total_weight := 1;
        END IF;

        -- Find existing batch for this barangay
        SELECT b.id, b.total_weight
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= max_weight_capacity
        ORDER BY (max_weight_capacity - b.total_weight) DESC, b.created_at ASC
        LIMIT 1;

        -- Create new batch or add to existing
        IF current_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, max_weight_capacity, 'pending')
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE '🆕 CREATED BATCH % FOR BARANGAY: %', current_batch_id, order_barangay;
        ELSE
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE '📦 ADDED TO EXISTING BATCH % (BARANGAY: %)', current_batch_id, order_barangay;
        END IF;

        NEW.batch_id := current_batch_id;
        RAISE NOTICE '✅ ORDER % BATCHED SUCCESSFULLY', NEW.id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ ERROR BATCHING ORDER %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create function to FORCE fix all existing batches using frontend structure
CREATE OR REPLACE FUNCTION force_fix_all_batches_frontend()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_record RECORD;
    detected_barangay text;
    fixed_count INTEGER := 0;
    total_batches INTEGER := 0;
BEGIN
    -- Count total batches
    SELECT COUNT(*) INTO total_batches FROM order_batches;
    RAISE NOTICE '🔧 FIXING % BATCHES USING FRONTEND STRUCTURE', total_batches;
    
    -- Fix ALL batches
    FOR batch_record IN 
        SELECT id, barangay, status
        FROM order_batches 
        WHERE status IN ('pending', 'ready_for_delivery')
    LOOP
        RAISE NOTICE '🔧 FIXING BATCH % (current barangay: %)', batch_record.id, batch_record.barangay;
        
        -- Get the first order in this batch
        SELECT o.delivery_address
        INTO order_record
        FROM orders o
        WHERE o.batch_id = batch_record.id
        LIMIT 1;
        
        IF order_record.delivery_address IS NOT NULL THEN
            -- Extract barangay using frontend structure
            detected_barangay := extract_barangay_from_frontend_address(order_record.delivery_address);
            
            RAISE NOTICE '📍 DETECTED BARANGAY FOR BATCH %: %', batch_record.id, detected_barangay;
            
            -- Update the batch with detected barangay
            UPDATE order_batches 
            SET barangay = detected_barangay
            WHERE id = batch_record.id;
            
            fixed_count := fixed_count + 1;
            RAISE NOTICE '✅ FIXED BATCH %: % -> %', batch_record.id, batch_record.barangay, detected_barangay;
        ELSE
            RAISE NOTICE '❌ NO ORDER FOUND FOR BATCH %', batch_record.id;
        END IF;
    END LOOP;
    
    RETURN format('Force fixed %s batches using frontend structure', fixed_count);
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create auto-assignment function
CREATE OR REPLACE FUNCTION auto_assign_ready_batches()
RETURNS TRIGGER AS $$
DECLARE
    batch_record RECORD;
    min_weight_threshold decimal := 3500;
    assigned_count INTEGER := 0;
BEGIN
    FOR batch_record IN 
        SELECT id, barangay, total_weight
        FROM order_batches 
        WHERE status = 'pending' 
        AND total_weight >= min_weight_threshold
    LOOP
        UPDATE order_batches 
        SET status = 'ready_for_delivery'
        WHERE id = batch_record.id;
        
        assigned_count := assigned_count + 1;
        RAISE NOTICE '🚚 AUTO-ASSIGNED BATCH % (barangay: %, weight: %kg)', 
            batch_record.id, batch_record.barangay, batch_record.total_weight;
    END LOOP;
    
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

-- Step 6: FORCE FIX ALL EXISTING BATCHES USING FRONTEND STRUCTURE
SELECT force_fix_all_batches_frontend();

-- Step 7: Add comments
COMMENT ON FUNCTION extract_barangay_from_frontend_address(jsonb) IS 'Extracts barangay from frontend delivery_address structure with barangay field';
COMMENT ON FUNCTION batch_approved_orders() IS 'Batches orders using frontend-compatible barangay extraction';
COMMENT ON FUNCTION force_fix_all_batches_frontend() IS 'Force fixes all batches using frontend delivery_address structure';






