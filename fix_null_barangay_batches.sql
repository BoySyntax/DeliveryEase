-- Fix batches with NULL barangay values
-- This script will update batches that have NULL barangay by getting the barangay from their orders

-- 1. First, let's see which batches have NULL barangay
SELECT 
    '=== BATCHES WITH NULL BARANGAY ===' as info;

SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    b.status,
    b.created_at,
    COUNT(o.id) as order_count
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.barangay IS NULL OR b.barangay = ''
GROUP BY b.id, b.barangay, b.total_weight, b.status, b.created_at;

-- 2. Update batches with NULL barangay by getting barangay from their orders
UPDATE order_batches 
SET barangay = (
    SELECT DISTINCT o.delivery_address->>'barangay'
    FROM orders o
    WHERE o.batch_id = order_batches.id
    AND o.delivery_address->>'barangay' IS NOT NULL
    AND o.delivery_address->>'barangay' != ''
    LIMIT 1
)
WHERE (barangay IS NULL OR barangay = '')
AND EXISTS (
    SELECT 1 
    FROM orders o 
    WHERE o.batch_id = order_batches.id
    AND o.delivery_address->>'barangay' IS NOT NULL
    AND o.delivery_address->>'barangay' != ''
);

-- 3. For batches that still have NULL barangay (no orders with barangay), set a default
UPDATE order_batches 
SET barangay = 'Default Area'
WHERE (barangay IS NULL OR barangay = '')
AND NOT EXISTS (
    SELECT 1 
    FROM orders o 
    WHERE o.batch_id = order_batches.id
    AND o.delivery_address->>'barangay' IS NOT NULL
    AND o.delivery_address->>'barangay' != ''
);

-- 4. Update the batch assignment function to prevent creating batches with NULL barangay
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    lock_key bigint;
BEGIN
    -- Process the order if it's approved and either:
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
        
        -- CRITICAL: Don't create batches without barangay
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'Unknown Barangay' THEN
            RAISE EXCEPTION 'Cannot create batch for order % without barangay. Delivery address: %', NEW.id, NEW.delivery_address;
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

        -- Create a lock key based on barangay to prevent race conditions
        lock_key := abs(hashtext(order_barangay || '_batch_lock'));
        
        -- Acquire advisory lock to prevent concurrent batch creation for same barangay
        PERFORM pg_advisory_xact_lock(lock_key);

        -- Find the OLDEST pending batch for this barangay that has capacity
        -- IMPORTANT: Only consider batches that have a valid barangay
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.barangay IS NOT NULL
        AND b.barangay != ''
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY b.created_at ASC  -- OLDEST FIRST (FIFO)
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_barangay, NEW.total_weight, 3500)
            RETURNING id INTO current_batch_id;
        ELSE
            -- Update existing batch's total weight
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

-- 5. Clean up any batches that have no orders (orphaned batches)
DELETE FROM order_batches 
WHERE id NOT IN (
    SELECT DISTINCT batch_id 
    FROM orders 
    WHERE batch_id IS NOT NULL
);

-- 6. Show the results
SELECT 
    '=== FIXED BATCHES ===' as info;

SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    b.status,
    b.created_at,
    COUNT(o.id) as order_count
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
GROUP BY b.id, b.barangay, b.total_weight, b.status, b.created_at
ORDER BY b.created_at;

-- 7. Show any remaining issues
SELECT 
    '=== REMAINING ISSUES ===' as info;

SELECT 
    'Batches with NULL barangay' as issue,
    COUNT(*) as count
FROM order_batches 
WHERE barangay IS NULL OR barangay = ''

UNION ALL

SELECT 
    'Orders without batch' as issue,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NULL

UNION ALL

SELECT 
    'Orders with NULL barangay' as issue,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' 
AND (delivery_address->>'barangay' IS NULL OR delivery_address->>'barangay' = ''); 