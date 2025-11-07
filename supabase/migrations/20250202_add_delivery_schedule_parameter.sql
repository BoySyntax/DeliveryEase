-- Add delivery schedule parameter based on 8:00 PM cutoff
-- This migration adds the delivery_scheduled_date field to order_batches table

-- Step 1: Add delivery_scheduled_date column to order_batches table
ALTER TABLE order_batches 
ADD COLUMN delivery_scheduled_date DATE;

-- Step 2: Add comment explaining the 8:00 PM schedule parameter
COMMENT ON COLUMN order_batches.delivery_scheduled_date IS 
'Delivery scheduled date based on 8:00 PM cutoff: Before 8:00 PM = next day, After 8:00 PM = following day';

-- Step 3: Create function to calculate delivery schedule based on batch creation time
CREATE OR REPLACE FUNCTION calculate_delivery_schedule(batch_created_at TIMESTAMPTZ)
RETURNS DATE AS $$
DECLARE
    batch_hour INTEGER;
    delivery_date DATE;
BEGIN
    -- Extract hour from batch creation time
    batch_hour := EXTRACT(HOUR FROM batch_created_at);
    
    -- Calculate delivery date based on 8:00 PM cutoff (20:00)
    IF batch_hour < 20 THEN
        -- Before 8:00 PM - schedule for next-day delivery
        delivery_date := (batch_created_at::DATE) + INTERVAL '1 day';
        RAISE NOTICE 'Batch created before 8:00 PM - scheduled for next-day delivery: %', delivery_date;
    ELSE
        -- After 8:00 PM - schedule for following-day delivery
        delivery_date := (batch_created_at::DATE) + INTERVAL '2 days';
        RAISE NOTICE 'Batch created after 8:00 PM - scheduled for following-day delivery: %', delivery_date;
    END IF;
    
    RETURN delivery_date;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Update existing batches with calculated delivery schedule
UPDATE order_batches 
SET delivery_scheduled_date = calculate_delivery_schedule(created_at)
WHERE delivery_scheduled_date IS NULL;

-- Step 5: Create trigger to automatically set delivery_scheduled_date on batch creation
CREATE OR REPLACE FUNCTION set_delivery_schedule_on_batch_creation()
RETURNS TRIGGER AS $$
BEGIN
    -- Set delivery schedule based on creation time
    NEW.delivery_scheduled_date := calculate_delivery_schedule(NEW.created_at);
    
    RAISE NOTICE 'Batch % delivery scheduled for: %', NEW.id, NEW.delivery_scheduled_date;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Add trigger to order_batches table
DROP TRIGGER IF EXISTS trigger_set_delivery_schedule ON order_batches;
CREATE TRIGGER trigger_set_delivery_schedule
    BEFORE INSERT ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION set_delivery_schedule_on_batch_creation();

-- Step 7: Create function to get batches by delivery date
CREATE OR REPLACE FUNCTION get_batches_by_delivery_date(target_date DATE)
RETURNS TABLE (
    batch_id UUID,
    barangay TEXT,
    total_weight DECIMAL,
    driver_id UUID,
    status TEXT,
    delivery_scheduled_date DATE,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ob.id as batch_id,
        ob.barangay,
        ob.total_weight,
        ob.driver_id,
        ob.status,
        ob.delivery_scheduled_date,
        ob.created_at
    FROM order_batches ob
    WHERE ob.delivery_scheduled_date = target_date
    ORDER BY ob.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Add index for better performance on delivery date queries
CREATE INDEX IF NOT EXISTS idx_order_batches_delivery_scheduled_date 
ON order_batches(delivery_scheduled_date);

-- Step 9: Add constraint to ensure delivery_scheduled_date is not null
ALTER TABLE order_batches 
ADD CONSTRAINT order_batches_delivery_scheduled_date_not_null 
CHECK (delivery_scheduled_date IS NOT NULL);

-- Step 10: Log the migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Delivery schedule parameter (8:00 PM cutoff) successfully added to order_batches table';
    RAISE NOTICE '📅 All existing batches updated with calculated delivery dates';
    RAISE NOTICE '🕗 New batches will automatically get delivery schedule based on creation time';
END $$;








