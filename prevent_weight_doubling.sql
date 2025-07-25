-- Fix to prevent weight doubling by ensuring proper recalculation
-- This replaces the batch_approved_orders function with a corrected version

-- Drop the existing trigger first
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;

-- Create a corrected batch_approved_orders function that prevents doubling
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    calculated_weight decimal;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        IF order_barangay IS NULL OR order_barangay = '' THEN
            RAISE EXCEPTION 'No barangay found in delivery address for order %. Delivery address: %', NEW.id, NEW.delivery_address;
        END IF;

        -- Calculate order weight from order items (prevent doubling)
        SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
        INTO calculated_weight
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = NEW.id;
        
        NEW.total_weight := calculated_weight;

        -- Find an existing batch for the same barangay
        SELECT b.id
        INTO current_batch_id
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + calculated_weight <= b.max_weight
        ORDER BY (b.max_weight - b.total_weight) DESC, b.created_at ASC
        LIMIT 1;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_barangay, calculated_weight, 3500)
            RETURNING id INTO current_batch_id;
        ELSE
            -- IMPORTANT: Recalculate the entire batch weight from scratch (prevent doubling)
            UPDATE order_batches 
            SET total_weight = (
                SELECT COALESCE(SUM(
                    (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
                     FROM order_items oi
                     JOIN products p ON p.id = oi.product_id
                     WHERE oi.order_id = o.id)
                ), 0)
                FROM orders o
                WHERE o.batch_id = current_batch_id 
                AND o.approval_status = 'approved'
            )
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

-- Recreate the trigger
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- Fix current batch weights to prevent future doubling
UPDATE order_batches 
SET total_weight = (
    SELECT COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id)
    ), 0)
    FROM orders o
    WHERE o.batch_id = order_batches.id 
    AND o.approval_status = 'approved'
)
WHERE status IN ('pending', 'assigned');

-- Verify the fix
SELECT 
    'WEIGHT DOUBLING FIX APPLIED' as status,
    b.id,
    b.total_weight as fixed_weight,
    COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id)
    ), 0) as calculated_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status IN ('pending', 'assigned')
GROUP BY b.id, b.total_weight
ORDER BY b.created_at DESC; 