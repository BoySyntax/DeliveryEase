-- Quick fix for order verification issues
-- Add missing columns to order_batches if they don't exist

-- Add max_weight column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'order_batches' AND column_name = 'max_weight') THEN
        ALTER TABLE order_batches ADD COLUMN max_weight decimal NOT NULL DEFAULT 3500;
    END IF;
END $$;

-- Update existing batches to have a default max_weight
UPDATE order_batches SET max_weight = 3500 WHERE max_weight IS NULL;

-- Make barangay column nullable if it isn't already
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'order_batches' AND column_name = 'barangay' AND is_nullable = 'NO') THEN
        ALTER TABLE order_batches ALTER COLUMN barangay DROP NOT NULL;
        ALTER TABLE order_batches ALTER COLUMN barangay SET DEFAULT 'Default Area';
    END IF;
END $$;

-- Update existing NULL barangay values
UPDATE order_batches SET barangay = 'Default Area' WHERE barangay IS NULL OR barangay = '';

-- Create or replace a simplified trigger function that works with simplified addresses
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_area text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    batch_max_weight decimal := 3500; -- Default max weight
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND (OLD.approval_status IS NULL OR OLD.approval_status != 'approved') THEN
        
        -- Use a simplified area identifier
        order_area := COALESCE(
            NEW.delivery_address->>'street_address',
            NEW.delivery_address->>'barangay',  -- fallback for old data
            'Default Area'
        );

        -- Calculate order weight if not set
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * COALESCE(p.weight, 1)), 1)
            INTO calculated_weight
            FROM order_items oi
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
        END IF;

        -- Find an existing batch that can accommodate this order
        SELECT b.id, COALESCE(b.total_weight, 0)
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND COALESCE(b.total_weight, 0) + NEW.total_weight <= COALESCE(b.max_weight, batch_max_weight)
        ORDER BY (COALESCE(b.max_weight, batch_max_weight) - COALESCE(b.total_weight, 0)) DESC, b.created_at ASC
        LIMIT 1;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_area, NEW.total_weight, batch_max_weight, 'pending')
            RETURNING id INTO current_batch_id;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = COALESCE(batch_total_weight, 0) + NEW.total_weight
            WHERE id = current_batch_id;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the order update
        RAISE WARNING 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders(); 