-- FIX BATCH ASSIGNMENT ISSUE
-- This fixes the logic to properly group orders by barangay and only create new batches when full

-- =====================================================
-- STEP 1: DROP EXISTING TRIGGER AND FUNCTION
-- =====================================================

DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
DROP FUNCTION IF EXISTS batch_approved_orders();

-- =====================================================
-- STEP 2: CREATE IMPROVED BATCH ASSIGNMENT FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    lock_key bigint;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND (OLD IS NULL OR OLD.approval_status != 'approved') THEN
        
        -- Get the order's barangay from delivery_address
        order_barangay := COALESCE(NEW.delivery_address->>'barangay', 'Unknown');
        
        -- Create a lock key based on barangay to prevent race conditions
        lock_key := abs(hashtext(order_barangay || '_batch_lock'));
        
        -- Acquire advisory lock to prevent concurrent batch creation for same barangay
        PERFORM pg_advisory_xact_lock(lock_key);

        -- Calculate order weight if not set
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
        END IF;

        -- FIXED LOGIC: Find existing pending batch for this barangay
        -- Don't check capacity - just find the most recent batch for this barangay
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        ORDER BY b.created_at DESC  -- Use newest batch first (LIFO)
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF current_batch_id IS NOT NULL THEN
            -- Check if adding this order would exceed capacity
            IF (batch_total_weight + NEW.total_weight) <= 3500 THEN
                -- Add to existing batch
                UPDATE order_batches 
                SET total_weight = batch_total_weight + NEW.total_weight
                WHERE id = current_batch_id;
                
                NEW.batch_id := current_batch_id;
                RAISE NOTICE '✅ Order % added to existing batch % (barangay: %, weight: % + % = %)', 
                    NEW.id, current_batch_id, order_barangay, batch_total_weight, NEW.total_weight, 
                    batch_total_weight + NEW.total_weight;
            ELSE
                -- Existing batch would exceed capacity, create new batch
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
                RETURNING id INTO current_batch_id;
                
                NEW.batch_id := current_batch_id;
                RAISE NOTICE '🆕 Created new batch % for barangay % (order weight: %)', 
                    current_batch_id, order_barangay, NEW.total_weight;
            END IF;
        ELSE
            -- No existing batch for this barangay, create new one
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
            
            NEW.batch_id := current_batch_id;
            RAISE NOTICE '🆕 Created first batch % for barangay % (order weight: %)', 
                current_batch_id, order_barangay, NEW.total_weight;
        END IF;
        
        -- Advisory lock is automatically released at end of transaction
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the order creation
        RAISE WARNING 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 3: RECREATE THE TRIGGER
-- =====================================================

CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- =====================================================
-- STEP 4: FIX EXISTING UNBATCHED ORDERS
-- =====================================================

-- Function to fix existing approved orders that don't have batch_id
CREATE OR REPLACE FUNCTION fix_unbatched_orders()
RETURNS void AS $$
DECLARE
    order_record RECORD;
    current_batch_id uuid;
    batch_total_weight decimal;
BEGIN
    -- Process each approved order without batch_id
    FOR order_record IN
        SELECT o.id, o.total_weight, o.delivery_address->>'barangay' as barangay
        FROM orders o
        WHERE o.approval_status = 'approved' 
        AND o.batch_id IS NULL
        ORDER BY o.created_at ASC
    LOOP
        -- Find existing batch for this barangay
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_record.barangay
        ORDER BY b.created_at DESC
        LIMIT 1;

        IF current_batch_id IS NOT NULL THEN
            -- Check if adding this order would exceed capacity
            IF (batch_total_weight + order_record.total_weight) <= 3500 THEN
                -- Add to existing batch
                UPDATE order_batches 
                SET total_weight = batch_total_weight + order_record.total_weight
                WHERE id = current_batch_id;
                
                UPDATE orders 
                SET batch_id = current_batch_id
                WHERE id = order_record.id;
                
                RAISE NOTICE '✅ Fixed: Order % added to existing batch % (barangay: %)', 
                    order_record.id, current_batch_id, order_record.barangay;
            ELSE
                -- Create new batch
                INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                VALUES (order_record.barangay, order_record.total_weight, 3500, 'pending')
                RETURNING id INTO current_batch_id;
                
                UPDATE orders 
                SET batch_id = current_batch_id
                WHERE id = order_record.id;
                
                RAISE NOTICE '🆕 Fixed: Created new batch % for order % (barangay: %)', 
                    current_batch_id, order_record.id, order_record.barangay;
            END IF;
        ELSE
            -- Create first batch for this barangay
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_record.barangay, order_record.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
            
            UPDATE orders 
            SET batch_id = current_batch_id
            WHERE id = order_record.id;
            
            RAISE NOTICE '🆕 Fixed: Created first batch % for order % (barangay: %)', 
                current_batch_id, order_record.id, order_record.barangay;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 5: APPLY THE FIX
-- =====================================================

-- Fix existing unbatched orders
SELECT fix_unbatched_orders();

-- =====================================================
-- STEP 6: VERIFICATION
-- =====================================================

-- Show the results
SELECT 
    '🎉 BATCH ASSIGNMENT FIXED!' as status,
    'Orders will now be grouped by barangay and only create new batches when full' as description;

-- Show current batch status
SELECT 
    b.barangay,
    b.total_weight,
    b.max_weight,
    COUNT(o.id) as order_count,
    ROUND((b.total_weight / b.max_weight * 100), 1) as capacity_percent
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.max_weight
ORDER BY b.created_at DESC; 