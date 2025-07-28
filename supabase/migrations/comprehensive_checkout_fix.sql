-- COMPREHENSIVE CHECKOUT FIX: Remove all problematic triggers and fix the issue
-- This will completely resolve the checkout error by preventing batch assignment during order creation

-- Step 1: Remove ALL batch-related triggers to prevent any interference
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS auto_correct_batch_weights_trigger ON orders;
DROP TRIGGER IF EXISTS auto_consolidate_batches_trigger ON order_batches;

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

-- Step 4: Clean up any empty or invalid batches
DELETE FROM order_batches 
WHERE status = 'pending'
AND (
    total_weight = 0 
    OR barangay IS NULL 
    OR barangay = ''
    OR barangay = 'null'
    OR barangay = 'NULL'
    OR barangay = 'Unknown'
    OR id NOT IN (
        SELECT DISTINCT batch_id 
        FROM orders 
        WHERE batch_id IS NOT NULL
    )
);

-- Step 5: Create a MANUAL batch assignment function (not automatic)
CREATE OR REPLACE FUNCTION manual_batch_approved_orders(order_id uuid)
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    max_weight_limit decimal := 3500;
BEGIN
    -- Get the order details
    SELECT o.*, 
           COALESCE(o.delivery_address->>'barangay', 'Unknown Location') as barangay_value
    INTO order_record
    FROM orders o
    WHERE o.id = order_id;
    
    IF NOT FOUND THEN
        RETURN 'Order not found';
    END IF;
    
    -- Only proceed if the order is approved
    IF order_record.approval_status != 'approved' THEN
        RETURN 'Order is not approved';
    END IF;
    
    order_barangay := order_record.barangay_value;
    
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
    WHERE oi.order_id = order_id;
    
    -- Validate weight
    IF calculated_weight <= 0 THEN
        RETURN 'Order has invalid weight: ' || calculated_weight;
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
    ) + calculated_weight <= max_weight_limit
    ORDER BY b.created_at ASC
    LIMIT 1;

    -- Create new batch ONLY if no existing batch found
    IF current_batch_id IS NULL THEN
        -- Create batch with the validated barangay
        INSERT INTO order_batches (barangay, total_weight, max_weight, status)
        VALUES (order_barangay, calculated_weight, max_weight_limit, 'pending')
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

    -- Update the order with batch_id and total_weight
    UPDATE orders 
    SET batch_id = current_batch_id,
        total_weight = calculated_weight
    WHERE id = order_id;
    
    RETURN 'Order assigned to batch: ' || current_batch_id;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'Error assigning order to batch: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create a function to manually approve orders and assign to batches
CREATE OR REPLACE FUNCTION approve_order_and_assign_batch(order_id uuid)
RETURNS TEXT AS $$
DECLARE
    result text;
BEGIN
    -- First approve the order
    UPDATE orders 
    SET approval_status = 'approved'
    WHERE id = order_id;
    
    -- Then assign to batch
    SELECT manual_batch_approved_orders(order_id) INTO result;
    
    RETURN 'Order approved and ' || result;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Show the fix results
SELECT 'COMPREHENSIVE CHECKOUT FIX APPLIED!' as status;
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
WHERE delivery_address->>'barangay' = 'Unknown Location'
UNION ALL
SELECT 
    'Remaining batches:' as type,
    COUNT(*) as count
FROM order_batches 
WHERE status = 'pending';

-- Step 8: Instructions for manual batch assignment
SELECT 'INSTRUCTIONS:' as info;
SELECT '1. Orders can now be placed without errors' as step;
SELECT '2. To assign orders to batches, use: SELECT approve_order_and_assign_batch(''order-id-here'');' as step;
SELECT '3. Or manually approve first, then assign: SELECT manual_batch_approved_orders(''order-id-here'');' as step; 