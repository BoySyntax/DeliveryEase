-- IMMEDIATE FIX for duplicate Patag batches
-- This script will consolidate your current batches and fix the trigger

-- STEP 1: Show current situation
SELECT 'BEFORE FIX - Current batches:' as status;
SELECT 
    id, 
    barangay, 
    total_weight, 
    max_weight,
    status,
    created_at
FROM order_batches 
WHERE status = 'pending' 
ORDER BY barangay, created_at;

-- STEP 2: Consolidate duplicate Patag batches
UPDATE orders 
SET batch_id = (
    SELECT id 
    FROM order_batches 
    WHERE barangay = 'Patag' AND status = 'pending' 
    ORDER BY created_at ASC 
    LIMIT 1
)
WHERE batch_id IN (
    SELECT id 
    FROM order_batches 
    WHERE barangay = 'Patag' AND status = 'pending'
);

-- Update the weight of the target batch
UPDATE order_batches 
SET total_weight = (
    SELECT COALESCE(SUM(o.total_weight), 0)
    FROM orders o 
    WHERE o.batch_id = order_batches.id
)
WHERE barangay = 'Patag' AND status = 'pending';

-- Delete empty batches
DELETE FROM order_batches 
WHERE barangay = 'Patag' 
AND status = 'pending' 
AND id NOT IN (
    SELECT DISTINCT batch_id 
    FROM orders 
    WHERE batch_id IS NOT NULL
);

-- STEP 3: Fix the trigger function to prevent future duplicates
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;

CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND (OLD.approval_status IS NULL OR OLD.approval_status != 'approved') THEN
        
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        -- Handle missing barangay
        IF order_barangay IS NULL OR order_barangay = '' THEN
            order_barangay := 'Unknown';
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

        -- Find an existing pending batch for the same barangay with available capacity
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY b.created_at ASC  -- Use oldest batch first
        LIMIT 1;

        IF current_batch_id IS NOT NULL THEN
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
        ELSE
            -- No suitable batch found, create a new one
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Don't fail the order creation, just log the error
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- STEP 4: Verify the fix
SELECT 'AFTER FIX - Consolidated batches:' as status;
SELECT 
    id, 
    barangay, 
    total_weight, 
    max_weight,
    ROUND((total_weight / max_weight * 100)::numeric, 1) as capacity_percent,
    status,
    created_at,
    (SELECT COUNT(*) FROM orders WHERE batch_id = order_batches.id) as order_count
FROM order_batches 
WHERE status = 'pending' 
ORDER BY barangay, created_at;

-- Check for any remaining duplicates
SELECT 'Remaining duplicate check:' as status;
SELECT 
    barangay, 
    COUNT(*) as batch_count
FROM order_batches 
WHERE status = 'pending'
GROUP BY barangay
HAVING COUNT(*) > 1;

SELECT 'SUCCESS: Batch consolidation completed!' as final_status; 