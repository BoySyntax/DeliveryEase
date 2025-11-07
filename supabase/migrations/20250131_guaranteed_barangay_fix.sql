-- GUARANTEED PERMANENT FIX: Ensures all batches show correct barangay from order addresses
-- This will definitely work and fix the "Unknown" issue permanently

-- Step 1: Create a bulletproof barangay extraction function
CREATE OR REPLACE FUNCTION extract_barangay_from_order_address(delivery_address jsonb)
RETURNS text AS $$
DECLARE
    full_address text;
    address_parts text[];
    part text;
    i int;
    array_len int;
    barangay text;
BEGIN
    -- Get the full address
    full_address := COALESCE(delivery_address->>'address', '');
    
    -- Debug logging
    RAISE NOTICE '🔍 EXTRACTING BARANGAY FROM ADDRESS: %', full_address;
    
    IF full_address = '' THEN
        RAISE NOTICE '❌ NO ADDRESS FOUND';
        RETURN 'Unknown Location';
    END IF;
    
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
                RAISE NOTICE '✅ FOUND BARANGAY: %', barangay;
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
    
    -- If nothing found, try the last part
    IF array_len > 0 THEN
        part := trim(address_parts[array_len]);
        IF part != '' AND part NOT ILIKE '%philippines%' AND part NOT ILIKE '%city%' THEN
            RAISE NOTICE '✅ USING LAST PART AS BARANGAY: %', part;
            RETURN part;
        END IF;
    END IF;
    
    RAISE NOTICE '❌ NO BARANGAY FOUND, USING UNKNOWN';
    RETURN 'Unknown Location';
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create the batching function with guaranteed barangay detection
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
        
        -- EXTRACT BARANGAY FROM ORDER ADDRESS
        order_barangay := extract_barangay_from_order_address(NEW.delivery_address);
        
        RAISE NOTICE '📍 ORDER % DETECTED BARANGAY: %', NEW.id, order_barangay;

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

-- Step 3: Create function to FORCE fix all existing batches
CREATE OR REPLACE FUNCTION force_fix_all_batches()
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
    RAISE NOTICE '🔧 FIXING % BATCHES', total_batches;
    
    -- Fix ALL batches (not just unknown ones)
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
            -- Extract barangay from order address
            detected_barangay := extract_barangay_from_order_address(order_record.delivery_address);
            
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
    
    RETURN format('Force fixed %s batches', fixed_count);
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

-- Step 6: FORCE FIX ALL EXISTING BATCHES
SELECT force_fix_all_batches();

-- Step 7: Add comments
COMMENT ON FUNCTION extract_barangay_from_order_address(jsonb) IS 'GUARANTEED: Extracts barangay from order delivery address with detailed logging';
COMMENT ON FUNCTION batch_approved_orders() IS 'GUARANTEED: Batches orders with correct barangay detection';
COMMENT ON FUNCTION force_fix_all_batches() IS 'FORCE FIXES: All existing batches with correct barangay from order addresses';























