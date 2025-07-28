-- Fix batch weight discrepancy between database and UI
-- This script recalculates batch weights based on actual order items

-- First, let's see the current discrepancy
SELECT 
    b.id,
    b.barangay,
    b.total_weight as db_weight,
    b.max_weight,
    COUNT(o.id) as order_count,
    -- Calculate actual weight from order items
    COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id)
    ), 0) as calculated_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.max_weight
ORDER BY b.created_at DESC;

-- Update all batch weights to match the calculated weight from order items
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
WHERE status = 'pending';

-- Verify the fix
SELECT 
    b.id,
    b.barangay,
    b.total_weight as updated_weight,
    b.max_weight,
    COUNT(o.id) as order_count,
    -- Calculate actual weight from order items to verify
    COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id)
    ), 0) as calculated_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.total_weight, b.max_weight
ORDER BY b.created_at DESC;

-- Also update the batch_approved_orders function to be more accurate
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
        -- Log the delivery_address for debugging
        RAISE NOTICE 'Processing order % with delivery_address: %', NEW.id, NEW.delivery_address;
        
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        RAISE NOTICE 'Extracted barangay: %', order_barangay;
        
        IF order_barangay IS NULL OR order_barangay = '' THEN
            RAISE EXCEPTION 'No barangay found in delivery address for order %. Delivery address: %', NEW.id, NEW.delivery_address;
        END IF;

        -- Calculate order weight from order items (more accurate)
        SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
        INTO calculated_weight
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = NEW.id;
        
        NEW.total_weight := calculated_weight;
        RAISE NOTICE 'Calculated weight for order %: %', NEW.id, calculated_weight;

        -- Find an existing batch that:
        -- 1. Is pending (not assigned to driver yet)
        -- 2. Has orders from the same barangay
        -- 3. Has enough remaining capacity
        -- 4. Prioritize the batch with the most remaining space (but still under max capacity)
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + calculated_weight <= b.max_weight
        ORDER BY (b.max_weight - b.total_weight) DESC, b.created_at ASC
        LIMIT 1;

        RAISE NOTICE 'Found existing batch: %, total_weight: %', current_batch_id, batch_total_weight;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            RAISE NOTICE 'Creating new batch for barangay: %, weight: %', order_barangay, calculated_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_barangay, calculated_weight, 3500)
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE 'Created new batch with id: %', current_batch_id;
        ELSE
            -- Update existing batch's total weight by recalculating from all orders
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
            
            RAISE NOTICE 'Updated batch % with recalculated total weight', current_batch_id;
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

-- Add a function to manually recalculate all batch weights
CREATE OR REPLACE FUNCTION recalculate_all_batch_weights()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    new_weight decimal;
    updated_count integer := 0;
BEGIN
    FOR batch_record IN 
        SELECT id FROM order_batches WHERE status = 'pending'
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
    
    RETURN 'Updated ' || updated_count || ' batch weights';
END;
$$ LANGUAGE plpgsql;

-- Execute the recalculation
SELECT recalculate_all_batch_weights();

-- Final verification
SELECT 
    'BATCH WEIGHT FIX COMPLETE' as status,
    COUNT(*) as total_batches,
    SUM(CASE WHEN total_weight = 0 THEN 1 ELSE 0 END) as empty_batches,
    SUM(CASE WHEN total_weight > max_weight THEN 1 ELSE 0 END) as overweight_batches
FROM order_batches 
WHERE status = 'pending'; 