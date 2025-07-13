-- Fix batch creation logic to create new batches when current ones reach 3500kg capacity
-- This prevents overloading batches and ensures optimal batch sizes

-- Update the batch_approved_orders function to create new batches when current ones are at capacity
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_area text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    remaining_capacity decimal;
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
        -- 2. Has not reached 3500kg capacity yet (has meaningful remaining space)
        -- 3. Has enough space for this order
        -- 4. Prioritize batches with most remaining space to optimize filling
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.total_weight < b.max_weight  -- Batch is not at full capacity
        AND b.total_weight + NEW.total_weight <= b.max_weight  -- Order fits in batch
        AND (b.max_weight - b.total_weight) >= 50  -- At least 50kg remaining capacity for meaningful space
        ORDER BY (b.max_weight - b.total_weight) DESC, b.created_at ASC
        LIMIT 1;

        IF current_batch_id IS NOT NULL THEN
            remaining_capacity := (3500 - batch_total_weight);
            RAISE NOTICE 'Found existing batch: %, current_weight: %kg, remaining_capacity: %kg', 
                        current_batch_id, batch_total_weight, remaining_capacity;
        END IF;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            RAISE NOTICE 'Creating new batch for area: %, weight: %kg', order_area, NEW.total_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_area, NEW.total_weight, 3500)
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE 'Created new batch with id: %', current_batch_id;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE 'Updated batch % with new total weight: %kg', current_batch_id, batch_total_weight + NEW.total_weight;
            
            -- Check if batch is now at or near capacity
            IF (batch_total_weight + NEW.total_weight) >= 3500 THEN
                RAISE NOTICE '🚚 Batch % has reached capacity (%.1fkg/3500kg) - ready for assignment!', 
                            current_batch_id, batch_total_weight + NEW.total_weight;
            END IF;
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

-- Add a function to check batch capacity status
CREATE OR REPLACE FUNCTION check_batch_capacity_status()
RETURNS TABLE (
    batch_id uuid,
    current_weight decimal,
    max_weight decimal,
    remaining_capacity decimal,
    capacity_percentage decimal,
    status text,
    is_ready_for_assignment boolean
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id as batch_id,
        b.total_weight as current_weight,
        b.max_weight,
        (b.max_weight - b.total_weight) as remaining_capacity,
        ROUND((b.total_weight / b.max_weight * 100)::numeric, 1) as capacity_percentage,
        b.status,
        (b.total_weight >= b.max_weight AND b.status = 'pending') as is_ready_for_assignment
    FROM order_batches b
    WHERE b.status IN ('pending', 'assigned')
    ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Create a function to automatically create new batch when needed
CREATE OR REPLACE FUNCTION create_new_batch_if_needed(p_area text DEFAULT 'Default Area')
RETURNS uuid AS $$
DECLARE
    new_batch_id uuid;
    available_batch_id uuid;
BEGIN
    -- Check if there's an available batch with capacity
    SELECT id INTO available_batch_id
    FROM order_batches 
    WHERE status = 'pending' 
    AND total_weight < max_weight 
    AND (max_weight - total_weight) >= 50  -- At least 50kg remaining
    AND barangay = p_area
    LIMIT 1;
    
    -- If no available batch, create a new one
    IF available_batch_id IS NULL THEN
        INSERT INTO order_batches (barangay, total_weight, max_weight)
        VALUES (p_area, 0, 3500)
        RETURNING id INTO new_batch_id;
        
        RAISE NOTICE 'Created new batch % for area: %', new_batch_id, p_area;
        RETURN new_batch_id;
    ELSE
        RETURN available_batch_id;
    END IF;
END;
$$ LANGUAGE plpgsql; 