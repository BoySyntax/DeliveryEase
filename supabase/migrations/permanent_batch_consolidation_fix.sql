-- PERMANENT FIX: Update the batch assignment trigger to properly consolidate batches
-- This will prevent the same barangay batch issue from happening again

-- First, let's fix the existing batches by consolidating them
-- Move all orders from newer batches to the oldest batch for each barangay
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

-- Now create a PERMANENT FIX by updating the batch assignment function
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    existing_batch_count integer;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Log the delivery_address for debugging
        RAISE NOTICE 'Processing order % with delivery_address: %', NEW.id, NEW.delivery_address;
        
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        RAISE NOTICE 'Extracted barangay: %', order_barangay;
        
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
            RAISE NOTICE 'Calculated weight for order %: %', NEW.id, calculated_weight;
        END IF;

        -- PERMANENT FIX: Check if there are multiple batches for the same barangay
        -- If so, consolidate them first before assigning the new order
        SELECT COUNT(*)
        INTO existing_batch_count
        FROM order_batches
        WHERE status = 'pending' 
        AND barangay = order_barangay;

        -- If multiple batches exist for the same barangay, consolidate them
        IF existing_batch_count > 1 THEN
            RAISE NOTICE 'Found % batches for barangay %. Consolidating...', existing_batch_count, order_barangay;
            
            -- Move all orders to the oldest batch
            UPDATE orders 
            SET batch_id = (
                SELECT id 
                FROM order_batches 
                WHERE barangay = order_barangay 
                AND status = 'pending'
                ORDER BY created_at ASC 
                LIMIT 1
            )
            WHERE batch_id IN (
                SELECT id 
                FROM order_batches 
                WHERE barangay = order_barangay 
                AND status = 'pending'
                ORDER BY created_at ASC 
                OFFSET 1
            );

            -- Update the consolidated batch weight
            UPDATE order_batches 
            SET total_weight = (
                SELECT COALESCE(SUM(o.total_weight), 0)
                FROM orders o
                WHERE o.batch_id = order_batches.id
            )
            WHERE id = (
                SELECT id 
                FROM order_batches 
                WHERE barangay = order_barangay 
                AND status = 'pending'
                ORDER BY created_at ASC 
                LIMIT 1
            );

            -- Delete the empty batches
            DELETE FROM order_batches 
            WHERE barangay = order_barangay 
            AND status = 'pending'
            AND id NOT IN (
                SELECT DISTINCT batch_id 
                FROM orders 
                WHERE batch_id IS NOT NULL
            );
        END IF;

        -- Now find the single batch for this barangay (or create one if none exists)
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY b.created_at ASC
        LIMIT 1;

        RAISE NOTICE 'Found existing batch: %, total_weight: %', current_batch_id, batch_total_weight;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            RAISE NOTICE 'Creating new batch for barangay: %, weight: %', order_barangay, NEW.total_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_barangay, NEW.total_weight, 3500)
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE 'Created new batch with id: %', current_batch_id;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE 'Updated batch % with new total weight: %', current_batch_id, batch_total_weight + NEW.total_weight;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
        RAISE NOTICE 'Assigned order % to batch %', NEW.id, current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Create a function to periodically consolidate existing batches
CREATE OR REPLACE FUNCTION consolidate_existing_batches()
RETURNS void AS $$
DECLARE
    batch_record RECORD;
BEGIN
    -- For each barangay with multiple batches, consolidate them
    FOR batch_record IN 
        SELECT DISTINCT barangay
        FROM order_batches 
        WHERE status = 'pending'
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        -- Move all orders to the oldest batch for this barangay
        UPDATE orders 
        SET batch_id = (
            SELECT id 
            FROM order_batches 
            WHERE barangay = batch_record.barangay 
            AND status = 'pending'
            ORDER BY created_at ASC 
            LIMIT 1
        )
        WHERE batch_id IN (
            SELECT id 
            FROM order_batches 
            WHERE barangay = batch_record.barangay 
            AND status = 'pending'
            ORDER BY created_at ASC 
            OFFSET 1
        );

        -- Update the consolidated batch weight
        UPDATE order_batches 
        SET total_weight = (
            SELECT COALESCE(SUM(o.total_weight), 0)
            FROM orders o
            WHERE o.batch_id = order_batches.id
        )
        WHERE id = (
            SELECT id 
            FROM order_batches 
            WHERE barangay = batch_record.barangay 
            AND status = 'pending'
            ORDER BY created_at ASC 
            LIMIT 1
        );

        -- Delete the empty batches
        DELETE FROM order_batches 
        WHERE barangay = batch_record.barangay 
        AND status = 'pending'
        AND id NOT IN (
            SELECT DISTINCT batch_id 
            FROM orders 
            WHERE batch_id IS NOT NULL
        );

        RAISE NOTICE 'Consolidated batches for barangay: %', batch_record.barangay;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run the consolidation function to fix existing batches
SELECT consolidate_existing_batches();

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