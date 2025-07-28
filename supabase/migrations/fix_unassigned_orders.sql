-- Quick fix to assign unassigned orders to existing batches
-- This will fix the issue where approved orders aren't being assigned to batches

-- 1. First, let's see what we're working with
SELECT '=== CURRENT STATE ===' as info;

SELECT 
    'Approved orders without batch:' as status,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' 
AND batch_id IS NULL;

SELECT 
    'Batches by barangay:' as status,
    barangay,
    COUNT(*) as batch_count,
    SUM(total_weight) as total_weight,
    MAX(max_weight) as max_weight
FROM order_batches
WHERE status = 'pending'
GROUP BY barangay
ORDER BY barangay;

-- 2. Show all approved orders and their batch assignments
SELECT 
    'All approved orders:' as status,
    o.id,
    o.approval_status,
    o.batch_id,
    o.total_weight,
    o.delivery_address->>'barangay' as barangay,
    o.created_at
FROM orders o
WHERE o.approval_status = 'approved'
ORDER BY o.created_at;

-- 3. Manually assign unassigned orders to existing batches
-- This will fix the immediate issue
DO $$
DECLARE
    order_record RECORD;
    target_batch_id uuid;
    batch_weight decimal;
BEGIN
    -- Loop through all approved orders without batch_id
    FOR order_record IN 
        SELECT 
            o.id,
            o.total_weight,
            o.delivery_address->>'barangay' as barangay
        FROM orders o
        WHERE o.approval_status = 'approved' 
        AND o.batch_id IS NULL
    LOOP
        -- Find an existing batch for this barangay with capacity
        SELECT b.id, b.total_weight
        INTO target_batch_id, batch_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_record.barangay
        AND b.total_weight + order_record.total_weight <= b.max_weight
        ORDER BY b.created_at ASC  -- Use oldest batch first
        LIMIT 1;
        
        -- If no suitable batch found, create a new one
        IF target_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_record.barangay, order_record.total_weight, 3500, 'pending')
            RETURNING id INTO target_batch_id;
            
            RAISE NOTICE 'Created new batch % for order % (barangay: %)', target_batch_id, order_record.id, order_record.barangay;
        ELSE
            -- Update existing batch weight
            UPDATE order_batches 
            SET total_weight = batch_weight + order_record.total_weight
            WHERE id = target_batch_id;
            
            RAISE NOTICE 'Added order % to existing batch % (barangay: %)', order_record.id, target_batch_id, order_record.barangay;
        END IF;
        
        -- Assign the order to the batch
        UPDATE orders 
        SET batch_id = target_batch_id
        WHERE id = order_record.id;
        
    END LOOP;
END $$;

-- 4. Check the results
SELECT '=== AFTER FIX ===' as info;

SELECT 
    'Approved orders without batch (should be 0):' as status,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' 
AND batch_id IS NULL;

SELECT 
    'Final batch distribution:' as status,
    barangay,
    COUNT(*) as batch_count,
    SUM(total_weight) as total_weight,
    MAX(max_weight) as max_weight
FROM order_batches
WHERE status = 'pending'
GROUP BY barangay
ORDER BY barangay;

SELECT 
    'Individual batches with orders:' as status,
    b.id,
    b.barangay,
    b.total_weight,
    b.max_weight,
    b.status,
    (SELECT COUNT(*) FROM orders WHERE batch_id = b.id) as order_count,
    (SELECT STRING_AGG(o.id::text, ', ') FROM orders o WHERE o.batch_id = b.id) as order_ids
FROM order_batches b
WHERE status = 'pending'
ORDER BY b.created_at;

-- 5. Also fix the batch assignment function to prevent this issue in the future
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
BEGIN
    -- Proceed if the order is approved and either:
    -- 1. It was just approved (status changed)
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
        
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'Unknown Barangay' THEN
            RAISE EXCEPTION 'No barangay found in delivery address for order %. Delivery address: %', NEW.id, NEW.delivery_address;
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

        -- Find an existing batch with capacity (prioritize oldest first)
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY b.created_at ASC  -- Use oldest batch first (FIFO)
        LIMIT 1;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE 'Created new batch % for order % (barangay: %)', current_batch_id, NEW.id, order_barangay;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE 'Added order % to existing batch % (barangay: %)', NEW.id, current_batch_id, order_barangay;
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

-- 6. Create a function to manually assign any remaining unassigned orders
CREATE OR REPLACE FUNCTION assign_all_unassigned_orders()
RETURNS INTEGER AS $$
DECLARE
    order_record RECORD;
    target_batch_id uuid;
    batch_weight decimal;
    assigned_count INTEGER := 0;
BEGIN
    -- Loop through all approved orders without batch_id
    FOR order_record IN 
        SELECT 
            o.id,
            o.total_weight,
            o.delivery_address->>'barangay' as barangay
        FROM orders o
        WHERE o.approval_status = 'approved' 
        AND o.batch_id IS NULL
    LOOP
        -- Find an existing batch for this barangay with capacity
        SELECT b.id, b.total_weight
        INTO target_batch_id, batch_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_record.barangay
        AND b.total_weight + order_record.total_weight <= b.max_weight
        ORDER BY b.created_at ASC
        LIMIT 1;
        
        -- If no suitable batch found, create a new one
        IF target_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_record.barangay, order_record.total_weight, 3500, 'pending')
            RETURNING id INTO target_batch_id;
        ELSE
            -- Update existing batch weight
            UPDATE order_batches 
            SET total_weight = batch_weight + order_record.total_weight
            WHERE id = target_batch_id;
        END IF;
        
        -- Assign the order to the batch
        UPDATE orders 
        SET batch_id = target_batch_id
        WHERE id = order_record.id;
        
        assigned_count := assigned_count + 1;
    END LOOP;
    
    RETURN assigned_count;
END;
$$ LANGUAGE plpgsql;

-- 7. Run the function to assign any remaining orders
SELECT assign_all_unassigned_orders() as orders_assigned; 