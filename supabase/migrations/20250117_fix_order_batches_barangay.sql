-- Fix order_batches table and triggers to work without barangay requirement
-- Since we've simplified addresses to only use street_address

-- First, update existing order_batches to have a default barangay value
UPDATE order_batches 
SET barangay = 'Default Area' 
WHERE barangay IS NULL OR barangay = '';

-- Make barangay column nullable and provide a default
ALTER TABLE order_batches 
ALTER COLUMN barangay DROP NOT NULL,
ALTER COLUMN barangay SET DEFAULT 'Default Area';

-- Update the batch_approved_orders function to work without barangay requirement
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_area text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Log the delivery_address for debugging
        RAISE NOTICE 'Processing order % with delivery_address: %', NEW.id, NEW.delivery_address;
        
        -- Use a simplified area identifier - either street_address or a default
        order_area := COALESCE(
            NEW.delivery_address->>'street_address',
            NEW.delivery_address->>'barangay',  -- fallback for old data
            'Default Area'
        );
        
        RAISE NOTICE 'Using area identifier: %', order_area;

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

        -- Find an existing batch that:
        -- 1. Is pending (not assigned to driver yet)
        -- 2. Has enough remaining capacity
        -- 3. Prioritize the batch with the most remaining space (but still under max capacity)
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY (b.max_weight - b.total_weight) DESC, b.created_at ASC
        LIMIT 1;

        RAISE NOTICE 'Found existing batch: %, total_weight: %', current_batch_id, batch_total_weight;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            RAISE NOTICE 'Creating new batch for area: %, weight: %', order_area, NEW.total_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_area, NEW.total_weight, 3500)
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

-- Update get_all_batch_summaries function to work with simplified areas
CREATE OR REPLACE FUNCTION get_all_batch_summaries(p_barangay text DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    created_at timestamp with time zone,
    status text,
    delivery_status text,
    driver_id uuid,
    total_weight decimal,
    barangay text,
    estimated_delivery_time timestamp with time zone,
    actual_delivery_time timestamp with time zone,
    notes text,
    driver_name text,
    order_count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.created_at,
        b.status,
        COALESCE(o.delivery_status, 'pending')::text as delivery_status,
        b.driver_id,
        b.total_weight,
        COALESCE(b.barangay, 'Default Area')::text as barangay,
        NULL::timestamp with time zone as estimated_delivery_time,
        NULL::timestamp with time zone as actual_delivery_time,
        NULL::text as notes,
        p.name as driver_name,
        COUNT(o.id) as order_count
    FROM order_batches b
    LEFT JOIN profiles p ON b.driver_id = p.id
    LEFT JOIN orders o ON o.batch_id = b.id
    WHERE (p_barangay IS NULL OR b.barangay = p_barangay OR b.barangay = 'Default Area')
    GROUP BY b.id, b.created_at, b.status, b.driver_id, b.total_weight, b.barangay, p.name, o.delivery_status
    ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql; 