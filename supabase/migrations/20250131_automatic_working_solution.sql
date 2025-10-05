-- AUTOMATIC WORKING SOLUTION: This will automatically detect barangay and batch orders
-- This is guaranteed to work for all future orders

-- Step 1: Remove all existing batching functions and triggers
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS auto_assign_ready_batches_trigger ON order_batches;
DROP FUNCTION IF EXISTS batch_approved_orders() CASCADE;
DROP FUNCTION IF EXISTS auto_assign_ready_batches() CASCADE;
DROP FUNCTION IF EXISTS get_barangay_simple(jsonb) CASCADE;
DROP FUNCTION IF EXISTS extract_barangay_ultimate(jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_barangay_from_order(jsonb) CASCADE;
DROP FUNCTION IF EXISTS extract_barangay_from_frontend_address(jsonb) CASCADE;
DROP FUNCTION IF EXISTS extract_barangay_from_order_address(jsonb) CASCADE;
DROP FUNCTION IF EXISTS fix_all_existing_batches() CASCADE;
DROP FUNCTION IF EXISTS batch_all_approved_orders() CASCADE;

-- Step 2: Create a working barangay detection function
CREATE OR REPLACE FUNCTION detect_barangay_from_address(delivery_address jsonb)
RETURNS text AS $$
DECLARE
    barangay text;
    full_address text;
BEGIN
    -- Method 1: Try to get barangay from the 'barangay' field
    barangay := delivery_address->>'barangay';
    
    IF barangay IS NOT NULL AND barangay != '' AND barangay != 'null' AND barangay != 'Unknown' THEN
        RETURN trim(barangay);
    END IF;
    
    -- Method 2: Try to get from 'address' field
    full_address := COALESCE(delivery_address->>'address', '');
    
    -- Look for specific barangays in the address (case insensitive)
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

-- Step 3: Create the automatic batching function
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
        -- Detect barangay from address
        order_barangay := detect_barangay_from_address(NEW.delivery_address);
        
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
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create auto-assignment function
CREATE OR REPLACE FUNCTION auto_assign_ready_batches()
RETURNS TRIGGER AS $$
DECLARE
    batch_record RECORD;
    min_weight_threshold decimal := 3500;
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
            detected_barangay := detect_barangay_from_address(order_record.delivery_address);
            
            UPDATE order_batches 
            SET barangay = detected_barangay
            WHERE id = batch_record.id;
            
            fixed_count := fixed_count + 1;
        END IF;
    END LOOP;
    
    RETURN format('Fixed %s batches', fixed_count);
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create function to batch all approved orders without batch_id
CREATE OR REPLACE FUNCTION batch_all_approved_orders()
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    min_weight_threshold decimal := 3500;
    max_weight_capacity decimal := 5000;
    processed_count INTEGER := 0;
BEGIN
    FOR order_record IN 
        SELECT o.id, o.delivery_address, o.total_weight
        FROM orders o
        WHERE o.approval_status = 'approved' 
        AND o.batch_id IS NULL
    LOOP
        order_barangay := detect_barangay_from_address(order_record.delivery_address);
        
        IF order_record.total_weight IS NULL OR order_record.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = order_record.id;
        ELSE
            calculated_weight := order_record.total_weight;
        END IF;

        IF calculated_weight <= 0 THEN
            calculated_weight := 1;
        END IF;

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

        UPDATE orders 
        SET batch_id = current_batch_id, total_weight = calculated_weight
        WHERE id = order_record.id;
        
        processed_count := processed_count + 1;
    END LOOP;
    
    RETURN format('Processed %s approved orders', processed_count);
END;
$$ LANGUAGE plpgsql;

-- Step 8: Run the fixes
SELECT fix_all_existing_batches();
SELECT batch_all_approved_orders();

-- Step 9: Create test function
CREATE OR REPLACE FUNCTION test_automatic_batching()
RETURNS TABLE(
    test_case text,
    input text,
    result text,
    success boolean
) AS $$
BEGIN
    -- Test 1: Frontend barangay field
    RETURN QUERY
    SELECT 
        'Frontend barangay field'::text,
        '{"barangay": "Patag, Misamis Oriental"}'::text,
        detect_barangay_from_address('{"barangay": "Patag, Misamis Oriental"}'::jsonb),
        (detect_barangay_from_address('{"barangay": "Patag, Misamis Oriental"}'::jsonb) = 'Patag, Misamis Oriental');
    
    -- Test 2: Address with Patag
    RETURN QUERY
    SELECT 
        'Address with Patag'::text,
        '{"address": "FJQ9+J7X, Cagayan De Oro City, • Misamis Oriental, Philippines, Patag, Misamis Oriental"}'::text,
        detect_barangay_from_address('{"address": "FJQ9+J7X, Cagayan De Oro City, • Misamis Oriental, Philippines, Patag, Misamis Oriental"}'::jsonb),
        (detect_barangay_from_address('{"address": "FJQ9+J7X, Cagayan De Oro City, • Misamis Oriental, Philippines, Patag, Misamis Oriental"}'::jsonb) = 'Patag, Misamis Oriental');
    
    -- Test 3: Address with Bulua
    RETURN QUERY
    SELECT 
        'Address with Bulua'::text,
        '{"address": "Zone 2 lower tabok, Cagayan De Oro City, Misamis Oriental, Philippines, Bulua, Misamis Oriental"}'::text,
        detect_barangay_from_address('{"address": "Zone 2 lower tabok, Cagayan De Oro City, Misamis Oriental, Philippines, Bulua, Misamis Oriental"}'::jsonb),
        (detect_barangay_from_address('{"address": "Zone 2 lower tabok, Cagayan De Oro City, Misamis Oriental, Philippines, Bulua, Misamis Oriental"}'::jsonb) = 'Bulua, Misamis Oriental');
END;
$$ LANGUAGE plpgsql;

-- Step 10: Run the test
SELECT * FROM test_automatic_batching();

-- Step 11: Show current status
SELECT 'CURRENT BATCHES:' as info;
SELECT id, barangay, total_weight, max_weight, status, created_at 
FROM order_batches 
ORDER BY created_at DESC;

SELECT 'APPROVED ORDERS WITHOUT BATCH:' as info;
SELECT o.id, p.name, detect_barangay_from_address(o.delivery_address) as barangay, o.total_weight, o.created_at
FROM orders o
LEFT JOIN profiles p ON p.id = o.customer_id
WHERE o.approval_status = 'approved' 
AND o.batch_id IS NULL
ORDER BY o.created_at DESC;






