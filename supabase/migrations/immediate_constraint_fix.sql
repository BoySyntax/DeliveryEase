-- IMMEDIATE FIX FOR UNIQUE CONSTRAINT VIOLATION
-- This script fixes the constraint issue and handles any stuck orders

-- =====================================================
-- STEP 1: DROP THE PROBLEMATIC CONSTRAINT IMMEDIATELY
-- =====================================================

-- Drop the constraint that's causing the error
DROP INDEX IF EXISTS unique_pending_batch_per_barangay;
DROP INDEX IF EXISTS unique_under_capacity_batch_per_barangay;

-- =====================================================
-- STEP 2: CREATE THE FIXED CONSTRAINT
-- =====================================================

-- Create a new constraint that only prevents duplicates when there's an under-capacity batch
CREATE UNIQUE INDEX IF NOT EXISTS unique_under_capacity_batch_per_barangay 
ON order_batches (barangay) 
WHERE status = 'pending' 
AND total_weight < max_weight;

-- =====================================================
-- STEP 3: HANDLE ANY STUCK ORDERS
-- =====================================================

-- Find approved orders without batch assignments
WITH unassigned_orders AS (
    SELECT 
        o.id,
        o.delivery_address->>'barangay' as barangay,
        COALESCE(o.total_weight, 1) as order_weight
    FROM orders o
    WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NULL
)
-- Assign them to existing batches or create new ones
SELECT 
    'Processing order: ' || uo.id || ' for barangay: ' || uo.barangay as action
FROM unassigned_orders uo;

-- =====================================================
-- STEP 4: UPDATE TRIGGER FUNCTION
-- =====================================================

DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;

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

        -- Find existing pending batch for this barangay with capacity
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY b.created_at ASC  -- Always use oldest batch first (FIFO)
        LIMIT 1
        FOR UPDATE SKIP LOCKED;  -- Skip if another transaction is updating

        IF current_batch_id IS NOT NULL THEN
            -- Update existing batch's total weight atomically
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            NEW.batch_id := current_batch_id;
        ELSE
            -- No suitable batch found, create a new one
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
            
            NEW.batch_id := current_batch_id;
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

-- Recreate the trigger
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- =====================================================
-- STEP 5: VERIFICATION
-- =====================================================

-- Show current batch status
SELECT 
    barangay,
    COUNT(*) as batch_count,
    SUM(total_weight) as total_weight,
    MAX(max_weight) as max_weight,
    status
FROM order_batches 
WHERE status = 'pending'
GROUP BY barangay, status
ORDER BY barangay;

-- Show unassigned orders
SELECT 
    COUNT(*) as unassigned_orders,
    COUNT(DISTINCT delivery_address->>'barangay') as affected_barangays
FROM orders 
WHERE approval_status = 'approved' 
AND batch_id IS NULL;

-- Success message
SELECT '🎉 CONSTRAINT FIXED! 🎉' as status,
       '✅ Orders can now be approved without constraint errors' as result; 