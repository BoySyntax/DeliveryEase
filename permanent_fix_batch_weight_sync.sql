-- PERMANENT FIX: Ensure database and UI weights always stay in sync
-- This will prevent the weight discrepancy issue from happening again

-- Step 1: Drop existing triggers to prevent conflicts
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
DROP TRIGGER IF EXISTS update_order_weight_trigger ON order_items;

-- Step 2: Create a robust batch_approved_orders function that always recalculates weights
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

        -- Calculate order weight from order items (always accurate)
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
            -- CRITICAL: Always recalculate the entire batch weight from scratch
            -- This prevents any accumulation errors or doubling issues
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

-- Step 3: Create a function to update order weights when items change
CREATE OR REPLACE FUNCTION update_order_total_weight()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the order's total weight when items are added/modified
    UPDATE orders
    SET total_weight = (
        SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = NEW.order_id
    )
    WHERE id = NEW.order_id;
    
    -- Also update the batch weight if the order is approved and assigned to a batch
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
    WHERE id = (
        SELECT batch_id 
        FROM orders 
        WHERE id = NEW.order_id
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create a function to sync batch weights when orders are updated
CREATE OR REPLACE FUNCTION sync_batch_weight_on_order_update()
RETURNS TRIGGER AS $$
BEGIN
    -- If order approval status changed, sync the batch weight
    IF NEW.approval_status != OLD.approval_status AND NEW.batch_id IS NOT NULL THEN
        UPDATE order_batches 
        SET total_weight = (
            SELECT COALESCE(SUM(
                (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
                 FROM order_items oi
                 JOIN products p ON p.id = oi.product_id
                 WHERE oi.order_id = o.id)
            ), 0)
            FROM orders o
            WHERE o.batch_id = NEW.batch_id 
            AND o.approval_status = 'approved'
        )
        WHERE id = NEW.batch_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create triggers to ensure automatic synchronization
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

CREATE TRIGGER update_order_weight_trigger
    AFTER INSERT OR UPDATE ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_order_total_weight();

CREATE TRIGGER sync_batch_weight_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION sync_batch_weight_on_order_update();

-- Step 6: Create a function to manually sync all batch weights (for maintenance)
CREATE OR REPLACE FUNCTION sync_all_batch_weights()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    new_weight decimal;
    updated_count integer := 0;
BEGIN
    FOR batch_record IN 
        SELECT id FROM order_batches WHERE status IN ('pending', 'assigned')
    LOOP
        -- Calculate actual weight for this batch
        SELECT COALESCE(SUM(
            (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
             FROM order_items oi
             JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = o.id)
        ), 0)
        INTO new_weight
        FROM orders o
        WHERE o.batch_id = batch_record.id 
        AND o.approval_status = 'approved';
        
        -- Update the batch weight
        UPDATE order_batches 
        SET total_weight = new_weight
        WHERE id = batch_record.id;
        
        updated_count := updated_count + 1;
    END LOOP;
    
    RETURN 'Synced ' || updated_count || ' batch weights';
END;
$$ LANGUAGE plpgsql;

-- Step 7: Fix current batch weights to match UI
SELECT sync_all_batch_weights();

-- Step 8: Verify the permanent fix is working
SELECT 
    'PERMANENT FIX APPLIED' as status,
    b.id,
    b.barangay,
    b.total_weight as db_weight,
    -- Calculate what UI should show
    COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id)
    ), 0) as ui_calculated_weight,
    CASE 
        WHEN b.total_weight = COALESCE(SUM(
            (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
             FROM order_items oi
             JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = o.id)
        ), 0) THEN '✅ SYNCED'
        ELSE '❌ NOT SYNCED'
    END as sync_status
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status IN ('pending', 'assigned')
GROUP BY b.id, b.barangay, b.total_weight
ORDER BY b.created_at DESC;

-- Step 9: Show summary
SELECT 
    'PERMANENT FIX COMPLETE' as status,
    'Database and UI weights will now stay in sync automatically' as message,
    COUNT(*) as total_batches,
    SUM(CASE WHEN total_weight = 0 THEN 1 ELSE 0 END) as empty_batches
FROM order_batches 
WHERE status IN ('pending', 'assigned'); 