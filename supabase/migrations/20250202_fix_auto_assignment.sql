-- Fix auto-assignment for batches that have reached 3500kg minimum
-- This ensures batches are properly assigned for delivery

-- Function to auto-assign all batches that have reached the minimum weight
CREATE OR REPLACE FUNCTION auto_assign_ready_batches_now()
RETURNS TABLE(
    batch_id uuid,
    barangay text,
    total_weight decimal,
    status text,
    assigned boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
    min_weight_threshold decimal := 3500;
    batch_record RECORD;
BEGIN
    -- Find all pending batches that have reached the minimum weight
    FOR batch_record IN 
        SELECT id, barangay, total_weight, status
        FROM order_batches 
        WHERE status = 'pending' 
        AND total_weight >= min_weight_threshold
    LOOP
        -- Update the batch status to ready_for_delivery
        UPDATE order_batches 
        SET status = 'ready_for_delivery'
        WHERE id = batch_record.id;
        
        -- Return the result
        batch_id := batch_record.id;
        barangay := batch_record.barangay;
        total_weight := batch_record.total_weight;
        status := 'ready_for_delivery';
        assigned := true;
        RETURN NEXT;
    END LOOP;
    
    -- If no batches were found, return empty result
    IF NOT FOUND THEN
        batch_id := NULL;
        barangay := 'No batches ready';
        total_weight := 0;
        status := 'none';
        assigned := false;
        RETURN NEXT;
    END IF;
END;
$$;

-- Run the auto-assignment
SELECT 'Auto-assigning ready batches...' as status;
SELECT * FROM auto_assign_ready_batches_now();

-- Show current batch status
SELECT 'Current batch status:' as info;
SELECT id, barangay, total_weight, max_weight, status, created_at 
FROM order_batches 
ORDER BY created_at DESC;























