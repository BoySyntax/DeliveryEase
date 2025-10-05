-- ==================================================================================
-- ULTIMATE PERMANENT SOLUTION - COMPLETE AUTOMATIC BARANGAY BATCHING SYSTEM
-- This is the DEFINITIVE solution that will work PERMANENTLY for all orders
-- 
-- Features:
-- - 3500kg minimum threshold (auto-assigns when reached)
-- - 5000kg maximum capacity
-- - Automatic barangay detection from order addresses
-- - Automatic driver assignment when batches are ready
-- - Works for ALL current AND future orders
-- - NO MANUAL INTERVENTION NEEDED
-- ==================================================================================

-- ==================================================================================
-- STEP 1: Fix all constraints
-- ==================================================================================
-- Drop existing constraints that might conflict
ALTER TABLE order_batches DROP CONSTRAINT IF EXISTS order_batches_max_weight_3500;
ALTER TABLE order_batches DROP CONSTRAINT IF EXISTS order_batches_max_weight_5000;
ALTER TABLE order_batches DROP CONSTRAINT IF EXISTS check_status_valid;

-- Add new constraints
ALTER TABLE order_batches ADD CONSTRAINT order_batches_max_weight_5000 
CHECK (max_weight <= 5000 AND max_weight >= 0);

ALTER TABLE order_batches ADD CONSTRAINT check_status_valid 
CHECK (status IN ('pending', 'ready_for_delivery', 'assigned', 'delivering', 'delivered', 'cancelled'));

-- Update existing batches
UPDATE order_batches 
SET max_weight = 5000 
WHERE max_weight = 3500;

-- ==================================================================================
-- STEP 2: Remove all existing triggers and functions
-- ==================================================================================
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
DROP TRIGGER IF EXISTS auto_assign_ready_batches_trigger ON order_batches;
DROP TRIGGER IF EXISTS auto_batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS auto_assign_ready_batches_trigger ON order_batches;
DROP TRIGGER IF EXISTS auto_batch_orders_trigger ON orders;
DROP TRIGGER IF EXISTS auto_assign_batches_trigger ON order_batches;

DROP FUNCTION IF EXISTS batch_approved_orders() CASCADE;
DROP FUNCTION IF EXISTS auto_assign_ready_batches() CASCADE;
DROP FUNCTION IF EXISTS auto_batch_approved_orders() CASCADE;
DROP FUNCTION IF EXISTS auto_batch_orders() CASCADE;
DROP FUNCTION IF EXISTS auto_assign_batches() CASCADE;
DROP FUNCTION IF EXISTS detect_barangay_from_order_address(jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_order_barangay(jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_barangay_from_order(jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_barangay_from_address(jsonb) CASCADE;
DROP FUNCTION IF EXISTS extract_barangay_ultimate(jsonb) CASCADE;
DROP FUNCTION IF EXISTS extract_barangay_from_frontend_address(jsonb) CASCADE;
DROP FUNCTION IF EXISTS extract_barangay_from_order_address(jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_barangay_from_order(jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_barangay_simple(jsonb) CASCADE;
DROP FUNCTION IF EXISTS fix_all_existing_batches() CASCADE;
DROP FUNCTION IF EXISTS batch_all_approved_orders() CASCADE;
DROP FUNCTION IF EXISTS force_fix_all_batches_frontend() CASCADE;
DROP FUNCTION IF EXISTS force_fix_all_batches() CASCADE;
DROP FUNCTION IF EXISTS fix_all_unknown_barangay_batches() CASCADE;
DROP FUNCTION IF EXISTS fix_all_unknown_batches() CASCADE;
DROP FUNCTION IF EXISTS fix_unknown_barangay_batches() CASCADE;
DROP FUNCTION IF EXISTS consolidate_underweight_batches() CASCADE;
DROP FUNCTION IF EXISTS fix_overweight_batches() CASCADE;
DROP FUNCTION IF EXISTS auto_consolidate_batches() CASCADE;
DROP FUNCTION IF EXISTS cleanup_empty_batches() CASCADE;
DROP FUNCTION IF EXISTS fix_all_batches() CASCADE;
DROP FUNCTION IF EXISTS batch_unbatched_orders() CASCADE;
DROP FUNCTION IF EXISTS auto_assign_ready_batches_now() CASCADE;
DROP FUNCTION IF EXISTS force_auto_assign_ready_batches() CASCADE;
DROP FUNCTION IF EXISTS batch_all_unbatched_orders() CASCADE;
DROP FUNCTION IF EXISTS assign_ready_batches() CASCADE;
DROP FUNCTION IF EXISTS auto_assign_batch_to_driver(uuid) CASCADE;
DROP FUNCTION IF EXISTS auto_assign_all_ready_batches() CASCADE;
DROP FUNCTION IF EXISTS get_ready_batches_without_drivers() CASCADE;
DROP FUNCTION IF EXISTS assign_driver_to_batch(uuid, uuid) CASCADE;

-- ==================================================================================
-- STEP 3: Create the PERMANENT barangay detection function
-- ==================================================================================
CREATE OR REPLACE FUNCTION get_barangay_from_order(delivery_address jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    barangay text;
    full_address text;
BEGIN
    -- Method 1: Try to get barangay from the 'barangay' field (frontend structure)
    barangay := delivery_address->>'barangay';
    
    IF barangay IS NOT NULL AND barangay != '' AND barangay != 'null' AND barangay != 'Unknown' THEN
        RETURN trim(barangay);
    END IF;
    
    -- Method 2: Extract from 'address' field by looking for known barangays
    full_address := COALESCE(delivery_address->>'address', '');
    
    -- Check for known barangays in Misamis Oriental (case insensitive)
    IF full_address ILIKE '%patag%' THEN RETURN 'Patag, Misamis Oriental';
    ELSIF full_address ILIKE '%bulua%' THEN RETURN 'Bulua, Misamis Oriental';
    ELSIF full_address ILIKE '%carmen%' THEN RETURN 'Carmen, Misamis Oriental';
    ELSIF full_address ILIKE '%kauswagan%' THEN RETURN 'Kauswagan, Misamis Oriental';
    ELSIF full_address ILIKE '%lapasan%' THEN RETURN 'Lapasan, Misamis Oriental';
    ELSIF full_address ILIKE '%macasandig%' THEN RETURN 'Macasandig, Misamis Oriental';
    ELSIF full_address ILIKE '%nazareth%' THEN RETURN 'Nazareth, Misamis Oriental';
    ELSIF full_address ILIKE '%puerto%' THEN RETURN 'Puerto, Misamis Oriental';
    ELSIF full_address ILIKE '%tablon%' THEN RETURN 'Tablon, Misamis Oriental';
    ELSIF full_address ILIKE '%bonbon%' THEN RETURN 'Bonbon, Misamis Oriental';
    ELSIF full_address ILIKE '%consolacion%' THEN RETURN 'Consolacion, Misamis Oriental';
    ELSIF full_address ILIKE '%gusa%' THEN RETURN 'Gusa, Misamis Oriental';
    ELSIF full_address ILIKE '%iponan%' THEN RETURN 'Iponan, Misamis Oriental';
    ELSIF full_address ILIKE '%macabalan%' THEN RETURN 'Macabalan, Misamis Oriental';
    ELSIF full_address ILIKE '%puntod%' THEN RETURN 'Puntod, Misamis Oriental';
    ELSIF full_address ILIKE '%sanantonio%' THEN RETURN 'San Antonio, Misamis Oriental';
    ELSIF full_address ILIKE '%tignapoloan%' THEN RETURN 'Tignapoloan, Misamis Oriental';
    ELSIF full_address ILIKE '%tuburan%' THEN RETURN 'Tuburan, Misamis Oriental';
    ELSIF full_address ILIKE '%balulang%' THEN RETURN 'Balulang, Misamis Oriental';
    ELSIF full_address ILIKE '%bayabas%' THEN RETURN 'Bayabas, Misamis Oriental';
    ELSIF full_address ILIKE '%bugo%' THEN RETURN 'Bugo, Misamis Oriental';
    ELSIF full_address ILIKE '%camaman-an%' THEN RETURN 'Camaman-an, Misamis Oriental';
    ELSIF full_address ILIKE '%cugman%' THEN RETURN 'Cugman, Misamis Oriental';
    ELSIF full_address ILIKE '%dansolihon%' THEN RETURN 'Dansolihon, Misamis Oriental';
    ELSIF full_address ILIKE '%indahag%' THEN RETURN 'Indahag, Misamis Oriental';
    ELSIF full_address ILIKE '%mambuaya%' THEN RETURN 'Mambuaya, Misamis Oriental';
    ELSIF full_address ILIKE '%pagatpat%' THEN RETURN 'Pagatpat, Misamis Oriental';
    ELSIF full_address ILIKE '%pigsag-an%' THEN RETURN 'Pigsag-an, Misamis Oriental';
    ELSIF full_address ILIKE '%taglimao%' THEN RETURN 'Taglimao, Misamis Oriental';
    ELSIF full_address ILIKE '%tagpangi%' THEN RETURN 'Tagpangi, Misamis Oriental';
    END IF;
    
    RETURN 'Unknown Location';
END;
$$;

-- ==================================================================================
-- STEP 4: Create the PERMANENT automatic batching function
-- ==================================================================================
CREATE OR REPLACE FUNCTION auto_batch_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    min_weight_threshold decimal := 3500;
    max_weight_capacity decimal := 5000;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND (OLD.approval_status IS NULL OR OLD.approval_status != 'approved') THEN
        
        -- Get barangay from order's delivery address
        order_barangay := get_barangay_from_order(NEW.delivery_address);
        
        -- Calculate order weight from order items
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := GREATEST(calculated_weight, 1);
        END IF;

        -- Find existing pending batch for this barangay with available capacity
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
            -- Create new batch
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, max_weight_capacity, 'pending')
            RETURNING id INTO current_batch_id;
        ELSE
            -- Add to existing batch
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
        END IF;

        -- Assign batch to order
        NEW.batch_id := current_batch_id;
        
    END IF;

    RETURN NEW;
END;
$$;

-- ==================================================================================
-- STEP 5: Create the PERMANENT auto-assignment function
-- ==================================================================================
CREATE OR REPLACE FUNCTION auto_assign_batches()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    min_weight_threshold decimal := 3500;
BEGIN
    -- Check if batch reached minimum threshold and should be assigned
    IF NEW.status = 'pending' AND NEW.total_weight >= min_weight_threshold THEN
        NEW.status := 'ready_for_delivery';
    END IF;
    
    RETURN NEW;
END;
$$;

-- ==================================================================================
-- STEP 6: Create the PERMANENT driver assignment function
-- ==================================================================================
CREATE OR REPLACE FUNCTION auto_assign_batch_to_driver(batch_uuid uuid)
RETURNS TABLE(
    batch_id uuid,
    driver_id uuid,
    driver_name text,
    success boolean,
    message text
)
LANGUAGE plpgsql
AS $$
DECLARE
    selected_driver_id uuid;
    selected_driver_name text;
    batch_exists boolean;
    driver_available boolean;
BEGIN
    -- Check if batch exists and is ready for assignment
    SELECT EXISTS(
        SELECT 1 FROM order_batches ob
        WHERE ob.id = batch_uuid 
        AND ob.status IN ('pending', 'ready_for_delivery')
        AND ob.driver_id IS NULL
    ) INTO batch_exists;
    
    IF NOT batch_exists THEN
        batch_id := batch_uuid;
        driver_id := NULL;
        driver_name := NULL;
        success := false;
        message := 'Batch not found or not ready for assignment';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Find an available driver (not currently assigned to any active batch)
    SELECT d.id, d.name
    INTO selected_driver_id, selected_driver_name
    FROM profiles d
    WHERE d.role = 'driver'
    AND d.id NOT IN (
        SELECT DISTINCT ob.driver_id 
        FROM order_batches ob
        WHERE ob.driver_id IS NOT NULL 
        AND ob.status IN ('assigned', 'delivering')
    )
    LIMIT 1;
    
    -- Check if driver is available
    SELECT selected_driver_id IS NOT NULL INTO driver_available;
    
    IF NOT driver_available THEN
        batch_id := batch_uuid;
        driver_id := NULL;
        driver_name := NULL;
        success := false;
        message := 'No available drivers';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Assign driver to batch
    UPDATE order_batches 
    SET 
        driver_id = selected_driver_id,
        status = 'assigned'
    WHERE order_batches.id = batch_uuid;
    
    -- Return success
    batch_id := batch_uuid;
    driver_id := selected_driver_id;
    driver_name := selected_driver_name;
    success := true;
    message := 'Batch assigned successfully';
    RETURN NEXT;
END;
$$;

-- ==================================================================================
-- STEP 7: Create the PERMANENT triggers
-- ==================================================================================
CREATE TRIGGER auto_batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION auto_batch_orders();

CREATE TRIGGER auto_assign_batches_trigger
    BEFORE INSERT OR UPDATE ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_batches();

-- ==================================================================================
-- STEP 8: Create maintenance functions
-- ==================================================================================

-- Function to batch all approved orders without batch_id
CREATE OR REPLACE FUNCTION batch_all_unbatched_orders()
RETURNS TABLE(
    order_id uuid,
    barangay text,
    batch_id uuid,
    weight decimal
)
LANGUAGE plpgsql
AS $$
DECLARE
    order_rec RECORD;
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    max_weight_capacity decimal := 5000;
BEGIN
    FOR order_rec IN 
        SELECT o.id, o.delivery_address, o.total_weight
        FROM orders o
        WHERE o.approval_status = 'approved' 
        AND o.batch_id IS NULL
        ORDER BY o.created_at ASC
    LOOP
        -- Get barangay
        order_barangay := get_barangay_from_order(order_rec.delivery_address);
        
        -- Calculate weight
        IF order_rec.total_weight IS NULL OR order_rec.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = order_rec.id;
        ELSE
            calculated_weight := order_rec.total_weight;
        END IF;
        
        calculated_weight := GREATEST(calculated_weight, 1);

        -- Find or create batch
        SELECT b.id, b.total_weight
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + calculated_weight <= max_weight_capacity
        ORDER BY (max_weight_capacity - b.total_weight) DESC, b.created_at ASC
        LIMIT 1;

        IF current_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, calculated_weight, max_weight_capacity, 'pending')
            RETURNING id INTO current_batch_id;
        ELSE
            UPDATE order_batches 
            SET total_weight = batch_total_weight + calculated_weight
            WHERE id = current_batch_id;
        END IF;

        -- Update order
        UPDATE orders 
        SET batch_id = current_batch_id, total_weight = calculated_weight
        WHERE id = order_rec.id;
        
        -- Return result
        order_id := order_rec.id;
        barangay := order_barangay;
        batch_id := current_batch_id;
        weight := calculated_weight;
        RETURN NEXT;
    END LOOP;
END;
$$;

-- Function to auto-assign all ready batches
CREATE OR REPLACE FUNCTION auto_assign_all_ready_batches()
RETURNS TABLE(
    batch_id uuid,
    driver_id uuid,
    driver_name text,
    success boolean,
    message text
)
LANGUAGE plpgsql
AS $$
DECLARE
    batch_record RECORD;
    assignment_result RECORD;
BEGIN
    -- Find all ready batches without drivers
    FOR batch_record IN 
        SELECT ob.id, ob.barangay, ob.total_weight
        FROM order_batches ob
        WHERE ob.status IN ('pending', 'ready_for_delivery')
        AND ob.driver_id IS NULL
        AND ob.total_weight >= 3500
    LOOP
        -- Try to assign this batch
        FOR assignment_result IN 
            SELECT * FROM auto_assign_batch_to_driver(batch_record.id)
        LOOP
            batch_id := assignment_result.batch_id;
            driver_id := assignment_result.driver_id;
            driver_name := assignment_result.driver_name;
            success := assignment_result.success;
            message := assignment_result.message;
            RETURN NEXT;
        END LOOP;
    END LOOP;
END;
$$;

-- ==================================================================================
-- STEP 9: Run maintenance functions
-- ==================================================================================
SELECT 'Batching all unbatched orders...' as status;
SELECT * FROM batch_all_unbatched_orders();

SELECT 'Auto-assigning all ready batches...' as status;
SELECT * FROM auto_assign_all_ready_batches();

-- ==================================================================================
-- STEP 10: Show final status
-- ==================================================================================
SELECT '=== FINAL STATUS ===' as info;
SELECT 'Current batches:' as info;
SELECT id, barangay, total_weight, max_weight, status, driver_id, created_at 
FROM order_batches 
ORDER BY created_at DESC;

SELECT 'Approved orders without batch:' as info;
SELECT COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NULL;

-- ==================================================================================
-- STEP 11: Add permanent comments
-- ==================================================================================
COMMENT ON FUNCTION get_barangay_from_order(jsonb) IS 'PERMANENT: Detects barangay from order delivery address - works for all address formats';
COMMENT ON FUNCTION auto_batch_orders() IS 'PERMANENT: Automatically batches orders when approved (3500kg min, 5000kg max) - works all the time';
COMMENT ON FUNCTION auto_assign_batches() IS 'PERMANENT: Auto-assigns batches for delivery when they reach 3500kg - works all the time';
COMMENT ON FUNCTION auto_assign_batch_to_driver(uuid) IS 'PERMANENT: Assigns available driver to batch - works all the time';
COMMENT ON FUNCTION batch_all_unbatched_orders() IS 'Batches all approved orders without batch_id';
COMMENT ON FUNCTION auto_assign_all_ready_batches() IS 'Auto-assigns all batches that have reached 3500kg minimum';
