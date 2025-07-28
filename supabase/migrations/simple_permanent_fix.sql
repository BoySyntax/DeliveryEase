-- SIMPLE PERMANENT FIX: Update the batch assignment trigger to prevent multiple batches per barangay

-- First, consolidate existing batches
WITH batch_ranking AS (
    SELECT 
        id,
        barangay,
        total_weight,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY barangay ORDER BY created_at) as rn
    FROM order_batches 
    WHERE status = 'pending'
)
UPDATE orders 
SET batch_id = (
    SELECT br.id 
    FROM batch_ranking br 
    WHERE br.barangay = (
        SELECT barangay FROM order_batches WHERE id = orders.batch_id
    ) 
    AND br.rn = 1
)
WHERE batch_id IN (
    SELECT id FROM batch_ranking WHERE rn > 1
);

-- Update the total weight of the consolidated batches
UPDATE order_batches 
SET total_weight = (
    SELECT COALESCE(SUM(o.total_weight), 0)
    FROM orders o
    WHERE o.batch_id = order_batches.id
)
WHERE status = 'pending';

-- Delete the empty batches (those with no orders)
DELETE FROM order_batches 
WHERE status = 'pending' 
AND id NOT IN (
    SELECT DISTINCT batch_id 
    FROM orders 
    WHERE batch_id IS NOT NULL
);

-- Now update the batch assignment function to prevent future issues
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        IF order_barangay IS NULL OR order_barangay = '' THEN
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

        -- PERMANENT FIX: Always use the existing batch for the barangay if it exists and has capacity
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY b.created_at ASC
        LIMIT 1;

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

-- Show the result
SELECT 'After permanent fix - consolidated batches:' as status;
SELECT 
    id,
    barangay,
    total_weight,
    max_weight,
    status,
    created_at,
    (SELECT COUNT(*) FROM orders WHERE batch_id = ob.id) as order_count
FROM order_batches ob
WHERE status = 'pending'
ORDER BY barangay, created_at; 