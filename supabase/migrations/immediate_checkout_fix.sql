-- IMMEDIATE CHECKOUT FIX: Prevent barangay constraint error during order placement
-- This will fix the issue where orders can't be placed due to null barangay

-- Step 1: Temporarily disable the batch assignment trigger to prevent errors
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;

-- Step 2: Fix existing addresses with null barangay
UPDATE addresses 
SET barangay = 'Unknown Location'
WHERE barangay IS NULL OR barangay = '' OR barangay = 'Unknown';

-- Step 3: Fix existing orders with invalid barangay in delivery_address
UPDATE orders 
SET delivery_address = jsonb_set(
    COALESCE(delivery_address, '{}'::jsonb),
    '{barangay}',
    '"Unknown Location"'
)
WHERE delivery_address->>'barangay' IS NULL 
   OR delivery_address->>'barangay' = ''
   OR delivery_address->>'barangay' = 'null'
   OR delivery_address->>'barangay' = 'NULL'
   OR delivery_address->>'barangay' = 'Unknown';

-- Step 4: Create a safe batch assignment function that handles null barangay
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    max_weight_limit decimal := 3500;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        
        -- Validate delivery address
        IF NEW.delivery_address IS NULL THEN
            RAISE EXCEPTION 'Order % has no delivery address', NEW.id;
        END IF;
        
        -- Extract barangay and ensure it's not null
        order_barangay := COALESCE(
            NEW.delivery_address->>'barangay',
            'Unknown Location'
        );
        
        -- Clean up the barangay value
        order_barangay := TRIM(order_barangay);
        IF order_barangay = '' OR order_barangay = 'null' OR order_barangay = 'NULL' THEN
            order_barangay := 'Unknown Location';
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
        AND LOWER(TRIM(b.barangay)) = LOWER(order_barangay)
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
            -- Create batch with the validated barangay
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, max_weight_limit, 'pending')
            RETURNING id INTO current_batch_id;
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

-- Step 5: Recreate the trigger
CREATE TRIGGER batch_approved_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- Step 6: Show the fix results
SELECT 'CHECKOUT FIX APPLIED - Orders can now be placed!' as status;
SELECT 
    'Fixed addresses:' as type,
    COUNT(*) as count
FROM addresses 
WHERE barangay = 'Unknown Location'
UNION ALL
SELECT 
    'Fixed orders:' as type,
    COUNT(*) as count
FROM orders 
WHERE delivery_address->>'barangay' = 'Unknown Location'; 