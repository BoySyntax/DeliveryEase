-- Emergency fix for delivery address trigger causing 400 errors
-- This replaces the old trigger that expects 'barangay' field with one that works with our simplified address system
-- Also ensures all missing columns exist in order_batches table

-- Ensure order_batches table has all required columns
ALTER TABLE order_batches 
ADD COLUMN IF NOT EXISTS max_weight numeric DEFAULT 3500;

ALTER TABLE order_batches 
ADD COLUMN IF NOT EXISTS driver_id uuid;

-- Add foreign key constraint for driver_id if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'order_batches' 
        AND constraint_name = 'order_batches_driver_id_fkey'
    ) THEN
        ALTER TABLE order_batches 
        ADD CONSTRAINT order_batches_driver_id_fkey 
        FOREIGN KEY (driver_id) REFERENCES profiles(id);
    END IF;
END $$;

-- Update existing batches to have the default max_weight
UPDATE order_batches 
SET max_weight = 3500 
WHERE max_weight IS NULL;

-- Make max_weight NOT NULL now that all rows have values
ALTER TABLE order_batches 
ALTER COLUMN max_weight SET NOT NULL;

DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;

-- Update the batch_approved_orders function to work with simplified delivery_address
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

-- Recreate the trigger
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- Log completion
SELECT 'Emergency fix applied successfully - order verification should now work' as status; 