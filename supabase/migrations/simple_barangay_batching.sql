-- Simple barangay-based batching system
-- Same barangay orders go to the SAME batch until it's completely full (3500kg)
-- Only create new batch when current batch for that barangay is full

-- 1. Remove any problematic constraints
DROP INDEX IF EXISTS unique_under_capacity_batch_per_barangay;
DROP INDEX IF EXISTS unique_batch_duplicate_prevention;

-- 2. Create simple and direct batch assignment function
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
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

        -- SIMPLE LOGIC: Find the ONLY pending batch for this barangay that has space
        -- This ensures same barangay orders ALWAYS go to the same batch until it's full
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND (b.total_weight + NEW.total_weight) <= 3500  -- Must fit within 3500kg
        ORDER BY b.created_at ASC  -- Get the oldest batch first
        LIMIT 1;

        -- If no batch found for this barangay (or all existing batches are full), create a new one
        IF current_batch_id IS NULL THEN
            -- Create new batch for this barangay
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
        ELSE
            -- Add to existing batch (guaranteed to fit within 3500kg)
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

-- 3. Clean up existing data
-- Remove batches with no orders
DELETE FROM order_batches 
WHERE id NOT IN (
    SELECT DISTINCT batch_id 
    FROM orders 
    WHERE batch_id IS NOT NULL
);

-- 4. Consolidate existing batches by barangay
-- This ensures each barangay has only ONE batch (unless it's full)
DO $$
DECLARE
    barangay_record RECORD;
    target_batch_id uuid;
    source_batch RECORD;
    combined_weight decimal;
BEGIN
    -- For each barangay with multiple batches, consolidate them
    FOR barangay_record IN
        SELECT barangay
        FROM order_batches
        WHERE status = 'pending'
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        -- Get the oldest batch as the target
        SELECT id INTO target_batch_id
        FROM order_batches
        WHERE status = 'pending'
        AND barangay = barangay_record.barangay
        ORDER BY created_at ASC
        LIMIT 1;
        
        -- Try to move orders from other batches to the target batch
        FOR source_batch IN
            SELECT id, total_weight
            FROM order_batches
            WHERE status = 'pending'
            AND barangay = barangay_record.barangay
            AND id != target_batch_id
            ORDER BY created_at ASC
        LOOP
            -- Check if we can combine these batches without exceeding 3500kg
            SELECT total_weight INTO combined_weight
            FROM order_batches
            WHERE id = target_batch_id;
            
            IF (combined_weight + source_batch.total_weight) <= 3500 THEN
                -- Move orders from source batch to target batch
                UPDATE orders
                SET batch_id = target_batch_id
                WHERE batch_id = source_batch.id;
                
                -- Delete the empty source batch
                DELETE FROM order_batches WHERE id = source_batch.id;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- 5. Re-process all approved orders that don't have a batch_id
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

-- 6. Update batch total weights to reflect actual order weights
UPDATE order_batches 
SET total_weight = (
    SELECT COALESCE(SUM(o.total_weight), 0)
    FROM orders o
    WHERE o.batch_id = order_batches.id
    AND o.approval_status = 'approved'
)
WHERE id IN (
    SELECT DISTINCT batch_id 
    FROM orders 
    WHERE batch_id IS NOT NULL
);

-- 7. Show the results
SELECT 
    '=== SIMPLE BARANGAY BATCHING COMPLETE ===' as info;

SELECT 
    'Orders processed' as status,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' 
AND batch_id IS NOT NULL;

SELECT 
    'Batches created' as status,
    COUNT(*) as count
FROM order_batches;

-- 8. Show batch distribution by barangay
SELECT 
    '=== BATCH DISTRIBUTION BY BARANGAY ===' as info;

SELECT 
    barangay,
    COUNT(*) as batch_count,
    SUM(total_weight) as total_weight,
    AVG(total_weight) as avg_weight,
    MIN(created_at) as oldest_batch,
    MAX(created_at) as newest_batch,
    CASE 
        WHEN COUNT(*) = 1 THEN '✅ PERFECT - One batch per barangay'
        WHEN COUNT(*) > 1 THEN '⚠️ MULTIPLE - Barangay has multiple batches (check if needed)'
        ELSE '❌ No batches'
    END as status
FROM order_batches
WHERE status = 'pending'
GROUP BY barangay
ORDER BY barangay;

-- 9. Show individual batches with capacity details
SELECT 
    '=== INDIVIDUAL BATCHES ===' as info;

SELECT 
    b.id,
    b.barangay,
    b.total_weight,
    b.max_weight,
    b.status,
    b.created_at,
    COUNT(o.id) as order_count,
    CASE 
        WHEN b.total_weight >= 3500 THEN '🟢 FULL - 3500kg reached'
        WHEN b.total_weight >= 3000 THEN '🟡 NEARLY FULL - ' || (3500 - b.total_weight) || 'kg remaining'
        ELSE '🔵 ACCEPTING - ' || (3500 - b.total_weight) || 'kg remaining'
    END as capacity_status,
    STRING_AGG(o.id::text, ', ' ORDER BY o.created_at) as order_ids
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.max_weight, b.status, b.created_at
ORDER BY b.barangay, b.created_at;

-- 10. Show any remaining issues
SELECT 
    '=== REMAINING ISSUES ===' as info;

SELECT 
    'Orders without batch' as issue,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' AND batch_id IS NULL

UNION ALL

SELECT 
    'Batches with NULL barangay' as issue,
    COUNT(*) as count
FROM order_batches 
WHERE barangay IS NULL OR barangay = ''

UNION ALL

SELECT 
    'Batches exceeding 3500kg' as issue,
    COUNT(*) as count
FROM order_batches 
WHERE total_weight > 3500

UNION ALL

SELECT 
    'Orders with NULL barangay' as issue,
    COUNT(*) as count
FROM orders 
WHERE approval_status = 'approved' 
AND (delivery_address->>'barangay' IS NULL OR delivery_address->>'barangay' = '');

-- 11. Test the logic with example scenarios
SELECT 
    '=== TEST SCENARIOS ===' as info;

-- Show how new orders would be assigned
SELECT 
    'Example: New order for Carmen (500kg)' as scenario,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM order_batches 
            WHERE barangay = 'Carmen' 
            AND status = 'pending' 
            AND (total_weight + 500) <= 3500
        ) THEN '✅ Would go to existing Carmen batch'
        ELSE '🆕 Would create new Carmen batch'
    END as result; 