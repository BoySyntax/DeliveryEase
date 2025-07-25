-- Migration: Permanent fix for batch consolidation issue
-- This ensures that orders from the same barangay are always consolidated into a single batch

-- Update the batch assignment function to prevent multiple batches per barangay
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

        -- PERMANENT FIX: Check if there are multiple batches for the same barangay
        -- If so, consolidate them first before assigning the new order
        SELECT COUNT(*)
        INTO existing_batch_count
        FROM order_batches
        WHERE status = 'pending' 
        AND barangay = order_barangay;

        -- If multiple batches exist for the same barangay, consolidate them
        IF existing_batch_count > 1 THEN
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

-- Create a function to consolidate existing batches
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
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Add a constraint to prevent multiple pending batches per barangay
-- This is a backup safety measure
ALTER TABLE order_batches 
ADD CONSTRAINT unique_pending_batch_per_barangay 
UNIQUE (barangay, status);

-- Run the consolidation function to fix any existing issues
SELECT consolidate_existing_batches(); 