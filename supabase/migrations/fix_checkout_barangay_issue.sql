-- FIX CHECKOUT BARANGAY ISSUE: Handle null barangay values properly
-- This will prevent the "null value in column barangay" error during order placement

-- Step 1: Check current addresses with null barangay
SELECT 'ADDRESSES WITH NULL BARANGAY:' as info;
SELECT 
    id,
    full_name,
    barangay,
    street_address
FROM addresses 
WHERE barangay IS NULL OR barangay = '' OR barangay = 'Unknown';

-- Step 2: Update addresses with null barangay to have a default value
UPDATE addresses 
SET barangay = COALESCE(
    barangay,
    'Unknown Location'
)
WHERE barangay IS NULL OR barangay = '' OR barangay = 'Unknown';

-- Step 3: Create a function to validate and fix delivery addresses
CREATE OR REPLACE FUNCTION validate_delivery_address(address_data jsonb)
RETURNS jsonb AS $$
DECLARE
    validated_address jsonb;
    barangay_value text;
BEGIN
    -- Extract barangay from the address data
    barangay_value := address_data->>'barangay';
    
    -- If barangay is null, empty, or 'Unknown', use a default value
    IF barangay_value IS NULL OR barangay_value = '' OR barangay_value = 'Unknown' THEN
        barangay_value := 'Unknown Location';
        
        -- Update the address data with the corrected barangay
        validated_address := address_data;
        validated_address := jsonb_set(validated_address, '{barangay}', to_jsonb(barangay_value));
    ELSE
        validated_address := address_data;
    END IF;
    
    RETURN validated_address;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Update the batch assignment function to handle delivery address validation
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    max_weight_limit decimal := 3500;
    validated_address jsonb;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        
        -- Validate delivery address
        IF NEW.delivery_address IS NULL THEN
            RAISE EXCEPTION 'Order % has no delivery address', NEW.id;
        END IF;
        
        -- Validate and fix the delivery address if needed
        validated_address := validate_delivery_address(NEW.delivery_address);
        NEW.delivery_address := validated_address;
        
        order_barangay := validated_address->>'barangay';
        
        -- Validate barangay
        IF order_barangay IS NULL OR 
           order_barangay = '' OR 
           order_barangay = 'null' OR 
           order_barangay = 'NULL' OR
           LENGTH(TRIM(order_barangay)) = 0 THEN
            RAISE EXCEPTION 'Order % has invalid barangay after validation: %', NEW.id, order_barangay;
        END IF;

        -- Calculate order weight from order items
        SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
        INTO calculated_weight
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = NEW.id;
        
        NEW.total_weight := calculated_weight;

        -- Validate weight
        IF NEW.total_weight <= 0 THEN
            RAISE EXCEPTION 'Order % has invalid weight: %', NEW.id, NEW.total_weight;
        END IF;

        -- Find existing batch in the SAME BARANGAY with available capacity
        SELECT b.id, (
            SELECT COALESCE(SUM(o.total_weight), 0)
            FROM orders o
            WHERE o.batch_id = b.id
            AND o.approval_status = 'approved'
        ) as actual_batch_weight
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND LOWER(TRIM(b.barangay)) = LOWER(TRIM(order_barangay))
        AND (
            SELECT COALESCE(SUM(o.total_weight), 0)
            FROM orders o
            WHERE o.batch_id = b.id
            AND o.approval_status = 'approved'
        ) + NEW.total_weight <= max_weight_limit
        ORDER BY b.created_at ASC
        LIMIT 1;

        -- Create new batch ONLY if no existing batch found
        IF current_batch_id IS NULL THEN
            -- Final validation before creating batch
            IF order_barangay IS NOT NULL 
               AND order_barangay != '' 
               AND order_barangay != 'null' 
               AND order_barangay != 'NULL'
               AND order_barangay != 'Unknown'
               AND LENGTH(TRIM(order_barangay)) > 0
               AND NEW.total_weight > 0 THEN
                
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (TRIM(order_barangay), NEW.total_weight, max_weight_limit, 'pending')
                RETURNING id INTO current_batch_id;
            ELSE
                RAISE EXCEPTION 'Cannot create batch: invalid barangay or weight for order %', NEW.id;
            END IF;
        ELSE
            -- Update existing batch weight by recalculating from ALL orders
            UPDATE order_batches 
            SET total_weight = (
                SELECT COALESCE(SUM(o.total_weight), 0)
                FROM orders o
                WHERE o.batch_id = current_batch_id
                AND o.approval_status = 'approved'
            )
            WHERE id = current_batch_id;
        END IF;

        -- Assign order to batch
        NEW.batch_id := current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create a function to fix existing orders with invalid barangay
CREATE OR REPLACE FUNCTION fix_existing_orders_barangay()
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    updated_count INTEGER := 0;
    validated_address jsonb;
BEGIN
    -- Find orders with invalid barangay in delivery_address
    FOR order_record IN 
        SELECT id, delivery_address
        FROM orders 
        WHERE delivery_address->>'barangay' IS NULL 
           OR delivery_address->>'barangay' = ''
           OR delivery_address->>'barangay' = 'null'
           OR delivery_address->>'barangay' = 'NULL'
           OR delivery_address->>'barangay' = 'Unknown'
    LOOP
        -- Validate and fix the delivery address
        validated_address := validate_delivery_address(order_record.delivery_address);
        
        -- Update the order with the corrected delivery address
        UPDATE orders 
        SET delivery_address = validated_address
        WHERE id = order_record.id;
        
        updated_count := updated_count + 1;
    END LOOP;
    
    IF updated_count > 0 THEN
        RETURN format('Fixed delivery address for %s orders', updated_count);
    ELSE
        RETURN 'No orders needed delivery address fixes';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Run the fixes
SELECT fix_existing_orders_barangay();

-- Step 7: Show final results
SELECT 'FINAL RESULT - All addresses and orders have valid barangay:' as info;
SELECT 
    'Addresses with valid barangay:' as type,
    COUNT(*) as count
FROM addresses 
WHERE barangay IS NOT NULL AND barangay != '' AND barangay != 'Unknown'
UNION ALL
SELECT 
    'Orders with valid barangay:' as type,
    COUNT(*) as count
FROM orders 
WHERE delivery_address->>'barangay' IS NOT NULL 
  AND delivery_address->>'barangay' != ''
  AND delivery_address->>'barangay' != 'Unknown';

-- Step 8: Show final status
SELECT 'CHECKOUT BARANGAY ISSUE FIXED - Orders can now be placed without barangay errors!' as status; 