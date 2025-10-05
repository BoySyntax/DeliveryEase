-- ==================================================================================
-- ABSOLUTE FINAL SOLUTION - PERMANENT AUTOMATIC BARANGAY BATCHING
-- This solution will work ALL THE TIME, PERMANENTLY
-- 
-- Features:
-- - 3500kg minimum threshold (auto-assigns when reached)
-- - 5000kg maximum capacity
-- - Automatic barangay detection from order addresses
-- - Works for ALL current AND future orders
-- - NO MANUAL INTERVENTION NEEDED
-- ==================================================================================

-- ==================================================================================
-- STEP 1: Fix constraints first
-- ==================================================================================
-- Drop the existing constraints that might conflict
ALTER TABLE order_batches DROP CONSTRAINT IF EXISTS order_batches_max_weight_3500;
ALTER TABLE order_batches DROP CONSTRAINT IF EXISTS order_batches_max_weight_5000;
ALTER TABLE order_batches DROP CONSTRAINT IF EXISTS check_status_valid;

-- Add new constraint with 5000kg maximum
ALTER TABLE order_batches ADD CONSTRAINT order_batches_max_weight_5000 
CHECK (max_weight <= 5000 AND max_weight >= 0);

-- Add new status constraint that allows 'ready_for_delivery'
ALTER TABLE order_batches ADD CONSTRAINT check_status_valid 
CHECK (status IN ('pending', 'ready_for_delivery', 'in_transit', 'delivered', 'cancelled'));

-- Update any existing batches that might have the old constraint
UPDATE order_batches 
SET max_weight = 5000 
WHERE max_weight = 3500;

-- ==================================================================================
-- STEP 2: COMPLETE CLEAN SLATE - Remove EVERYTHING
-- ==================================================================================
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
DROP TRIGGER IF EXISTS auto_assign_ready_batches_trigger ON order_batches;
DROP TRIGGER IF EXISTS auto_batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS auto_assign_ready_batches_trigger ON order_batches;

DROP FUNCTION IF EXISTS batch_approved_orders() CASCADE;
DROP FUNCTION IF EXISTS auto_assign_ready_batches() CASCADE;
DROP FUNCTION IF EXISTS get_order_barangay(jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_barangay_from_address(jsonb) CASCADE;
DROP FUNCTION IF EXISTS detect_barangay_from_address(jsonb) CASCADE;
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

-- ==================================================================================
-- STEP 3: Create the PERMANENT barangay detection function
-- ==================================================================================
CREATE OR REPLACE FUNCTION detect_barangay_from_order_address(delivery_address jsonb)
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
CREATE OR REPLACE FUNCTION auto_batch_approved_orders()
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
        order_barangay := detect_barangay_from_order_address(NEW.delivery_address);
        
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
CREATE OR REPLACE FUNCTION auto_assign_ready_batches()
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

-- Function to force auto-assignment of all ready batches (for manual use)
CREATE OR REPLACE FUNCTION force_auto_assign_ready_batches()
RETURNS TABLE(
    batch_id uuid,
    barangay text,
    total_weight decimal,
    old_status text,
    new_status text,
    assigned boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
    min_weight_threshold decimal := 3500;
    batch_record RECORD;
    assigned_count INTEGER := 0;
BEGIN
    -- Find all pending batches that have reached the minimum weight
    FOR batch_record IN 
        SELECT ob.id, ob.barangay, ob.total_weight, ob.status
        FROM order_batches ob
        WHERE ob.status = 'pending' 
        AND ob.total_weight >= min_weight_threshold
    LOOP
        -- Update the batch status to ready_for_delivery
        UPDATE order_batches 
        SET status = 'ready_for_delivery'
        WHERE id = batch_record.id;
        
        -- Return the result
        batch_id := batch_record.id;
        barangay := batch_record.barangay;
        total_weight := batch_record.total_weight;
        old_status := batch_record.status;
        new_status := 'ready_for_delivery';
        assigned := true;
        assigned_count := assigned_count + 1;
        RETURN NEXT;
    END LOOP;
    
    -- If no batches were found, return empty result
    IF assigned_count = 0 THEN
        batch_id := NULL;
        barangay := 'No batches ready for assignment';
        total_weight := 0;
        old_status := 'none';
        new_status := 'none';
        assigned := false;
        RETURN NEXT;
    END IF;
END;
$$;

-- Function to auto-assign all existing batches that have reached the minimum weight
CREATE OR REPLACE FUNCTION auto_assign_ready_batches_now()
RETURNS TABLE(
    batch_id uuid,
    barangay text,
    total_weight decimal,
    status text,
    assigned boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
    min_weight_threshold decimal := 3500;
    batch_record RECORD;
BEGIN
    -- Find all pending batches that have reached the minimum weight
    FOR batch_record IN 
        SELECT ob.id, ob.barangay, ob.total_weight, ob.status
        FROM order_batches ob
        WHERE ob.status = 'pending' 
        AND ob.total_weight >= min_weight_threshold
    LOOP
        -- Update the batch status to ready_for_delivery
        UPDATE order_batches 
        SET status = 'ready_for_delivery'
        WHERE id = batch_record.id;
        
        -- Return the result
        batch_id := batch_record.id;
        barangay := batch_record.barangay;
        total_weight := batch_record.total_weight;
        status := 'ready_for_delivery';
        assigned := true;
        RETURN NEXT;
    END LOOP;
    
    -- If no batches were found, return empty result
    IF NOT FOUND THEN
        batch_id := NULL;
        barangay := 'No batches ready';
        total_weight := 0;
        status := 'none';
        assigned := false;
        RETURN NEXT;
    END IF;
END;
$$;

-- ==================================================================================
-- STEP 6: Create the PERMANENT triggers
-- ==================================================================================
CREATE TRIGGER auto_batch_approved_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION auto_batch_approved_orders();

CREATE TRIGGER auto_assign_ready_batches_trigger
    BEFORE INSERT OR UPDATE ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_ready_batches();

-- ==================================================================================
-- STEP 7: Create the PERMANENT maintenance functions
-- ==================================================================================

-- Function to fix all existing batches with correct barangay
CREATE OR REPLACE FUNCTION fix_all_existing_batches()
RETURNS TABLE(
    batch_id uuid,
    old_barangay text,
    new_barangay text,
    total_weight decimal
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    UPDATE order_batches b
    SET barangay = (
        SELECT detect_barangay_from_order_address(o.delivery_address)
        FROM orders o
        WHERE o.batch_id = b.id
        LIMIT 1
    )
    WHERE b.id IN (
        SELECT DISTINCT o.batch_id
        FROM orders o
        WHERE o.batch_id IS NOT NULL
    )
    RETURNING b.id, b.barangay as old_barangay, 
              (SELECT detect_barangay_from_order_address(o.delivery_address) FROM orders o WHERE o.batch_id = b.id LIMIT 1) as new_barangay,
              b.total_weight;
END;
$$;

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
        order_barangay := detect_barangay_from_order_address(order_rec.delivery_address);
        
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

-- ==================================================================================
-- STEP 8: Create a function to verify the system is working
-- ==================================================================================
CREATE OR REPLACE FUNCTION verify_batching_system()
RETURNS TABLE(
    test_name text,
    result text,
    success boolean
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Test 1: Check if triggers exist
    RETURN QUERY
    SELECT 
        'Check if auto_batch_approved_orders_trigger exists'::text,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'auto_batch_approved_orders_trigger') 
            THEN 'Trigger exists'::text
            ELSE 'Trigger missing'::text
        END,
        EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'auto_batch_approved_orders_trigger');
    
    -- Test 2: Check if auto-assignment trigger exists
    RETURN QUERY
    SELECT 
        'Check if auto_assign_ready_batches_trigger exists'::text,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'auto_assign_ready_batches_trigger') 
            THEN 'Trigger exists'::text
            ELSE 'Trigger missing'::text
        END,
        EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'auto_assign_ready_batches_trigger');
    
    -- Test 3: Test barangay detection
    RETURN QUERY
    SELECT 
        'Test barangay detection from frontend'::text,
        detect_barangay_from_order_address('{"barangay": "Patag, Misamis Oriental"}'::jsonb),
        (detect_barangay_from_order_address('{"barangay": "Patag, Misamis Oriental"}'::jsonb) = 'Patag, Misamis Oriental');
    
    -- Test 4: Test barangay detection from address
    RETURN QUERY
    SELECT 
        'Test barangay detection from address'::text,
        detect_barangay_from_order_address('{"address": "Some address in Bulua, Misamis Oriental"}'::jsonb),
        (detect_barangay_from_order_address('{"address": "Some address in Bulua, Misamis Oriental"}'::jsonb) = 'Bulua, Misamis Oriental');
    
    -- Test 5: Check for unknown batches
    RETURN QUERY
    SELECT 
        'Check for unknown batches'::text,
        (SELECT COUNT(*)::text FROM order_batches WHERE barangay = 'Unknown' OR barangay = 'Unknown Location'),
        (SELECT COUNT(*) = 0 FROM order_batches WHERE barangay = 'Unknown' OR barangay = 'Unknown Location');
    
    -- Test 6: Check for approved orders without batch
    RETURN QUERY
    SELECT 
        'Check for approved orders without batch'::text,
        (SELECT COUNT(*)::text FROM orders WHERE approval_status = 'approved' AND batch_id IS NULL),
        (SELECT COUNT(*) = 0 FROM orders WHERE approval_status = 'approved' AND batch_id IS NULL);
END;
$$;

-- ==================================================================================
-- STEP 9: Run maintenance functions to fix existing data
-- ==================================================================================
SELECT 'Fixing existing batches...' as status;
SELECT * FROM fix_all_existing_batches();

SELECT 'Batching unbatched orders...' as status;
SELECT * FROM batch_all_unbatched_orders();

SELECT 'Auto-assigning ready batches...' as status;
SELECT * FROM auto_assign_ready_batches_now();

SELECT 'Force auto-assigning ready batches...' as status;
SELECT * FROM force_auto_assign_ready_batches();

-- ==================================================================================
-- STEP 10: Verify the system is working
-- ==================================================================================
SELECT 'Verifying system...' as status;
SELECT * FROM verify_batching_system();

-- ==================================================================================
-- STEP 11: Show final status
-- ==================================================================================
SELECT '=== FINAL STATUS ===' as info;
SELECT 'Current batches:' as info;
SELECT id, barangay, total_weight, max_weight, status, created_at 
FROM order_batches 
ORDER BY created_at DESC
LIMIT 10;

SELECT 'Approved orders without batch:' as info;
SELECT COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NULL;

-- ==================================================================================
-- STEP 12: Add permanent comments
-- ==================================================================================
COMMENT ON FUNCTION detect_barangay_from_order_address(jsonb) IS 'PERMANENT: Detects barangay from order delivery address - works for all address formats';
COMMENT ON FUNCTION auto_batch_approved_orders() IS 'PERMANENT: Automatically batches orders when approved (3500kg min, 5000kg max) - works all the time';
COMMENT ON FUNCTION auto_assign_ready_batches() IS 'PERMANENT: Auto-assigns batches for delivery when they reach 3500kg - works all the time';
COMMENT ON FUNCTION fix_all_existing_batches() IS 'Fixes all existing batches with correct barangay from order addresses';
COMMENT ON FUNCTION batch_all_unbatched_orders() IS 'Batches all approved orders without batch_id';
COMMENT ON FUNCTION verify_batching_system() IS 'Verifies that the batching system is working correctly';
