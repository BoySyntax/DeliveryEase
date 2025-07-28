-- Fix empty batch creation issue
-- Prevent batches from being created when there are no approved orders

-- 1. First, let's see what's causing empty batches
SELECT 
    '=== CURRENT EMPTY BATCHES ===' as info;

SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    b.status,
    b.created_at,
    COUNT(o.id) as order_count
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.total_weight = 0 OR b.total_weight IS NULL
GROUP BY b.id, b.barangay, b.total_weight, b.status, b.created_at;

-- 2. Clean up empty batches
DELETE FROM order_batches 
WHERE id NOT IN (
    SELECT DISTINCT batch_id 
    FROM orders 
    WHERE batch_id IS NOT NULL
);

-- 3. Update the batch assignment function to prevent empty batch creation
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
BEGIN
    -- ONLY process if the order is approved and either:
    -- 1. It was just approved (status changed from something else to 'approved')
    -- 2. It's approved but doesn't have a batch_id yet
    IF NEW.approval_status = 'approved' AND 
       (OLD.approval_status != 'approved' OR NEW.batch_id IS NULL) THEN
        
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        -- If barangay is still missing, try to get it from addresses table
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'Unknown Barangay' THEN
            SELECT a.barangay INTO order_barangay
            FROM addresses a
            WHERE a.customer_id = NEW.customer_id
            ORDER BY a.created_at DESC
            LIMIT 1;
            
            -- Update the delivery_address with the found barangay
            IF order_barangay IS NOT NULL AND order_barangay != '' THEN
                NEW.delivery_address := jsonb_set(
                    COALESCE(NEW.delivery_address, '{}'::jsonb),
                    '{barangay}',
                    order_barangay::jsonb
                );
            END IF;
        END IF;
        
        -- If still no barangay, use a default
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'Unknown Barangay' THEN
            order_barangay := 'Default Area';
            NEW.delivery_address := jsonb_set(
                COALESCE(NEW.delivery_address, '{}'::jsonb),
                '{barangay}',
                order_barangay::jsonb
            );
        END IF;

        -- Calculate order weight if not set
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
        END IF;

        -- CRITICAL: Only proceed if the order has a valid weight
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            RAISE EXCEPTION 'Order % has no valid weight and cannot be batched', NEW.id;
        END IF;

        -- Find an existing batch for this barangay that has space
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND (b.total_weight + NEW.total_weight) <= 3500
        ORDER BY b.created_at ASC
        LIMIT 1;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            -- Create new batch for this barangay with the order's weight
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
        ELSE
            -- Add to existing batch
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- 4. Check if there are any triggers that might be creating batches incorrectly
SELECT 
    '=== CHECKING TRIGGERS ===' as info;

SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders'
AND trigger_name LIKE '%batch%';

-- 5. Show current orders and their approval status
SELECT 
    '=== CURRENT ORDERS STATUS ===' as info;

SELECT 
    id,
    approval_status,
    batch_id,
    total_weight,
    delivery_address->>'barangay' as barangay,
    created_at
FROM orders 
ORDER BY created_at DESC;

-- 6. Show current batches and their orders
SELECT 
    '=== CURRENT BATCHES ===' as info;

SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    b.status,
    b.created_at,
    COUNT(o.id) as order_count,
    STRING_AGG(o.id::text, ', ' ORDER BY o.created_at) as order_ids
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
GROUP BY b.id, b.barangay, b.total_weight, b.status, b.created_at
ORDER BY b.created_at DESC;

-- 7. Test the batch assignment manually for any unbatched approved orders
DO $$
DECLARE
    order_record RECORD;
BEGIN
    FOR order_record IN
        SELECT id, approval_status, delivery_address, customer_id, total_weight
        FROM orders
        WHERE approval_status = 'approved' AND batch_id IS NULL
    LOOP
        -- Manually trigger the batch assignment for each order
        UPDATE orders 
        SET approval_status = 'approved'  -- This will trigger the function
        WHERE id = order_record.id;
    END LOOP;
END $$;

-- 8. Final cleanup - remove any remaining empty batches
DELETE FROM order_batches 
WHERE id NOT IN (
    SELECT DISTINCT batch_id 
    FROM orders 
    WHERE batch_id IS NOT NULL
);

-- 9. Show final results
SELECT 
    '=== FINAL RESULTS ===' as info;

SELECT 
    'Total batches' as metric,
    COUNT(*) as value
FROM order_batches

UNION ALL

SELECT 
    'Batches with orders' as metric,
    COUNT(*) as value
FROM order_batches b
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.batch_id = b.id)

UNION ALL

SELECT 
    'Empty batches' as metric,
    COUNT(*) as value
FROM order_batches b
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.batch_id = b.id)

UNION ALL

SELECT 
    'Approved orders' as metric,
    COUNT(*) as value
FROM orders 
WHERE approval_status = 'approved'

UNION ALL

SELECT 
    'Approved orders with batch' as metric,
    COUNT(*) as value
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NOT NULL;

-- 10. Show final batch distribution
SELECT 
    '=== FINAL BATCH DISTRIBUTION ===' as info;

SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    b.status,
    b.created_at,
    COUNT(o.id) as order_count,
    STRING_AGG(o.id::text, ', ' ORDER BY o.created_at) as order_ids
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
GROUP BY b.id, b.barangay, b.total_weight, b.status, b.created_at
ORDER BY b.created_at DESC; 