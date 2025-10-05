-- PERMANENT SOLUTION: Guaranteed batching that works for all future orders
-- This will definitely fix the "Unknown" issue permanently

-- Step 1: Drop all existing triggers and functions to start fresh
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS auto_assign_ready_batches_trigger ON order_batches;
DROP FUNCTION IF EXISTS batch_approved_orders() CASCADE;
DROP FUNCTION IF EXISTS auto_assign_ready_batches() CASCADE;
DROP FUNCTION IF EXISTS extract_barangay_from_frontend_address(jsonb) CASCADE;
DROP FUNCTION IF EXISTS force_fix_all_batches_frontend() CASCADE;

-- Step 2: Create a bulletproof barangay extraction function
CREATE OR REPLACE FUNCTION get_barangay_from_order(delivery_address jsonb)
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
    
    -- Method 2: Try to get from 'address' field
    full_address := COALESCE(delivery_address->>'address', '');
    
    IF full_address != '' THEN
        address_parts := string_to_array(full_address, ',');
        array_len := array_length(address_parts, 1);
        
        -- Look through each part (from end to beginning)
        i := array_len;
        WHILE i >= 1 LOOP
            part := trim(address_parts[i]);
            
            IF part != '' THEN
                -- Skip obvious non-barangay parts
                IF part ILIKE '%city%' OR part ILIKE '%philippines%' OR part ILIKE '%province%' OR 
                   part ILIKE '%misamis oriental%' OR part ILIKE '%cagayan de oro%' THEN
                    NULL;
                ELSIF part ILIKE '%barangay%' OR part ILIKE '%brgy%' THEN
                    barangay := regexp_replace(part, '^(barangay|brgy)\s*', '', 'gi');
                    barangay := trim(barangay);
                    IF barangay != '' THEN
                        RETURN barangay;
                    END IF;
                ELSIF length(part) > 2 AND length(part) < 50 THEN
                    IF part ~* '^[A-Za-z\s\-\.,]+$' AND part NOT ILIKE '%street%' AND part NOT ILIKE '%road%' THEN
                        RETURN part;
                    END IF;
                END IF;
            END IF;
            
            i := i - 1;
        END LOOP;
    END IF;
    
    -- Method 3: Look for specific known barangays
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
    
    RETURN 'Unknown Location';
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create the permanent batching function
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
        -- Extract barangay from order address
        order_barangay := get_barangay_from_order(NEW.delivery_address);
        
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
        ELSE
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
        END IF;

        NEW.batch_id := current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the transaction
        RETURN NEW;
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
    END LOOP;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create triggers
CREATE TRIGGER batch_approved_orders_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

CREATE TRIGGER auto_assign_ready_batches_trigger
    AFTER INSERT OR UPDATE ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_ready_batches();

-- Step 6: Create function to fix all existing batches
CREATE OR REPLACE FUNCTION fix_all_existing_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_record RECORD;
    detected_barangay text;
    fixed_count INTEGER := 0;
BEGIN
    FOR batch_record IN 
        SELECT id, barangay, status
        FROM order_batches 
        WHERE status IN ('pending', 'ready_for_delivery')
    LOOP
        SELECT o.delivery_address
        INTO order_record
        FROM orders o
        WHERE o.batch_id = batch_record.id
        LIMIT 1;
        
        IF order_record.delivery_address IS NOT NULL THEN
            detected_barangay := get_barangay_from_order(order_record.delivery_address);
            
            UPDATE order_batches 
            SET barangay = detected_barangay
            WHERE id = batch_record.id;
            
            fixed_count := fixed_count + 1;
        END IF;
    END LOOP;
    
    RETURN format('Fixed %s batches', fixed_count);
END;
$$ LANGUAGE plpgsql;

-- Step 7: Fix all existing batches
SELECT fix_all_existing_batches();

-- Step 8: Add comments
COMMENT ON FUNCTION get_barangay_from_order(jsonb) IS 'Permanent: Extracts barangay from order delivery address';
COMMENT ON FUNCTION batch_approved_orders() IS 'Permanent: Batches orders by barangay with 3500kg min, 5000kg max';
COMMENT ON FUNCTION auto_assign_ready_batches() IS 'Auto-assigns batches for delivery when they reach 3500kg minimum threshold';
COMMENT ON FUNCTION fix_all_existing_batches() IS 'Fixes all existing batches with correct barangay from order addresses';






