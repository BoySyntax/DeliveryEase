-- FIX NULL BATCH CREATION: Prevent null batches and ensure proper batch assignment
-- This will fix the issue where null batches are created and orders aren't properly assigned

-- Step 1: Check for any remaining triggers that might create batches
SELECT 'CHECKING FOR REMAINING TRIGGERS:' as info;
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table IN ('orders', 'order_batches')
ORDER BY trigger_name;

-- Step 2: Remove any remaining triggers that could create batches
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
DROP TRIGGER IF EXISTS auto_correct_batch_weights_trigger ON orders;
DROP TRIGGER IF EXISTS auto_consolidate_batches_trigger ON order_batches;
DROP TRIGGER IF EXISTS update_order_weight_trigger ON order_items;

-- Step 3: Clean up any null batches that were created
DELETE FROM order_batches 
WHERE barangay IS NULL 
   OR barangay = '' 
   OR barangay = 'null' 
   OR barangay = 'NULL'
   OR barangay = 'Unknown';

-- Step 4: Check for orders that should be assigned to batches
SELECT 'ORDERS THAT NEED BATCH ASSIGNMENT:' as info;
SELECT 
    o.id as order_id,
    o.approval_status,
    o.delivery_address->>'barangay' as barangay,
    o.batch_id,
    o.total_weight
FROM orders o
WHERE o.approval_status = 'approved'
  AND o.batch_id IS NULL
ORDER BY o.created_at;

-- Step 5: Create a robust batch assignment function
CREATE OR REPLACE FUNCTION assign_approved_orders_to_batches()
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    max_weight_limit decimal := 3500;
    assigned_count INTEGER := 0;
    error_count INTEGER := 0;
BEGIN
    -- Process all approved orders that don't have a batch
    FOR order_record IN 
        SELECT o.id, 
               o.delivery_address,
               COALESCE(o.delivery_address->>'barangay', 'Unknown Location') as barangay_value
        FROM orders o
        WHERE o.approval_status = 'approved'
          AND o.batch_id IS NULL
    LOOP
        BEGIN
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
            WHERE oi.order_id = order_record.id;
            
            -- Validate weight
            IF calculated_weight <= 0 THEN
                RAISE NOTICE 'Order % has invalid weight: %, skipping', order_record.id, calculated_weight;
                error_count := error_count + 1;
                CONTINUE;
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
                
                RAISE NOTICE 'Created new batch % for barangay %', current_batch_id, order_barangay;
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
                
                RAISE NOTICE 'Updated existing batch % for barangay %', current_batch_id, order_barangay;
            END IF;

            -- Update the order with batch_id and total_weight
            UPDATE orders 
            SET batch_id = current_batch_id,
                total_weight = calculated_weight
            WHERE id = order_record.id;
            
            assigned_count := assigned_count + 1;
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Error assigning order % to batch: %', order_record.id, SQLERRM;
                error_count := error_count + 1;
        END;
    END LOOP;
    
    IF assigned_count > 0 OR error_count > 0 THEN
        RETURN format('Assigned %s orders to batches, %s errors', assigned_count, error_count);
    ELSE
        RETURN 'No orders needed batch assignment';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create a function to approve and batch a specific order
CREATE OR REPLACE FUNCTION approve_and_batch_order(order_id uuid)
RETURNS TEXT AS $$
DECLARE
    result text;
BEGIN
    -- First approve the order
    UPDATE orders 
    SET approval_status = 'approved'
    WHERE id = order_id;
    
    -- Then assign to batch
    SELECT assign_approved_orders_to_batches() INTO result;
    
    RETURN 'Order approved and ' || result;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Run the batch assignment for existing approved orders
SELECT assign_approved_orders_to_batches();

-- Step 8: Show final results
SELECT 'FINAL RESULTS:' as info;
SELECT 
    'Approved orders with batches:' as type,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NOT NULL
UNION ALL
SELECT 
    'Approved orders without batches:' as type,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NULL
UNION ALL
SELECT 
    'Pending batches:' as type,
    COUNT(*) as count
FROM order_batches 
WHERE status = 'pending';

-- Step 9: Show batch details
SELECT 'BATCH DETAILS:' as info;
SELECT 
    b.id as batch_id,
    b.barangay,
    b.total_weight,
    COUNT(o.id) as order_count,
    b.created_at
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.created_at
ORDER BY b.created_at;

-- Step 10: Instructions
SELECT 'INSTRUCTIONS:' as info;
SELECT '1. To approve and batch an order: SELECT approve_and_batch_order(''order-id-here'');' as step;
SELECT '2. To batch all approved orders: SELECT assign_approved_orders_to_batches();' as step;
SELECT '3. No more null batches will be created' as step; 