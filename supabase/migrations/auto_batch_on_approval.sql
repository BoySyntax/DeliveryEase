-- AUTO BATCH ON APPROVAL: Enable automatic batch assignment when orders are approved
-- This will create batches automatically when orders are approved, but not when they're placed

-- Step 1: Clean up any existing problematic data
DELETE FROM order_batches 
WHERE status = 'pending'
AND (
    barangay IS NULL 
    OR barangay = '' 
    OR barangay = 'null' 
    OR barangay = 'NULL'
    OR barangay = 'Unknown'
    OR total_weight = 0
    OR id NOT IN (
        SELECT DISTINCT batch_id 
        FROM orders 
        WHERE batch_id IS NOT NULL
    )
);

-- Step 2: Remove batch assignments from pending orders (they shouldn't have batches yet)
UPDATE orders 
SET batch_id = NULL
WHERE approval_status = 'pending'
  AND batch_id IS NOT NULL;

-- Step 3: Create the automatic batch assignment function for approved orders
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

-- Step 4: Create the trigger for automatic batch assignment on approval
DROP TRIGGER IF EXISTS batch_approved_orders_trigger ON orders;
CREATE TRIGGER batch_approved_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- Step 5: Create a function to process all existing approved orders that don't have batches
CREATE OR REPLACE FUNCTION process_existing_approved_orders()
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    processed_count INTEGER := 0;
    error_count INTEGER := 0;
BEGIN
    -- Process all approved orders that don't have a batch
    FOR order_record IN 
        SELECT id, delivery_address
        FROM orders 
        WHERE approval_status = 'approved'
          AND batch_id IS NULL
    LOOP
        BEGIN
            -- Simulate the approval process to trigger batch assignment
            UPDATE orders 
            SET approval_status = 'approved'
            WHERE id = order_record.id;
            
            processed_count := processed_count + 1;
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Error processing order %: %', order_record.id, SQLERRM;
                error_count := error_count + 1;
        END;
    END LOOP;
    
    IF processed_count > 0 OR error_count > 0 THEN
        RETURN format('Processed %s orders, %s errors', processed_count, error_count);
    ELSE
        RETURN 'No orders needed processing';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Process existing approved orders
SELECT process_existing_approved_orders();

-- Step 7: Show final results
SELECT 'AUTO BATCH ON APPROVAL ENABLED!' as status;
SELECT 
    'Pending orders (no batches):' as type,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'pending' AND batch_id IS NULL
UNION ALL
SELECT 
    'Approved orders with batches:' as type,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NOT NULL
UNION ALL
SELECT 
    'Pending batches:' as type,
    COUNT(*) as count
FROM order_batches 
WHERE status = 'pending';

-- Step 8: Show batch details
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

-- Step 9: Instructions
SELECT 'INSTRUCTIONS:' as info;
SELECT '1. Orders can be placed without creating batches' as step;
SELECT '2. When you approve an order, it will automatically be assigned to a batch' as step;
SELECT '3. Orders from the same barangay will be grouped together' as step;
SELECT '4. Batches have a 3500kg weight limit' as step; 