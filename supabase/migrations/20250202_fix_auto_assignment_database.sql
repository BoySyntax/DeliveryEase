-- Fix auto-assignment by creating a database function that handles it properly
-- This avoids the 400 error by using a database function instead of direct updates

-- Function to auto-assign a batch to an available driver
CREATE OR REPLACE FUNCTION auto_assign_batch_to_driver(batch_uuid uuid)
RETURNS TABLE(
    batch_id uuid,
    driver_id uuid,
    driver_name text,
    success boolean,
    message text
)
LANGUAGE plpgsql
AS $$
DECLARE
    selected_driver_id uuid;
    selected_driver_name text;
    batch_exists boolean;
    driver_available boolean;
BEGIN
    -- Check if batch exists and is ready for assignment
    SELECT EXISTS(
        SELECT 1 FROM order_batches 
        WHERE id = batch_uuid 
        AND status IN ('pending', 'ready_for_delivery')
        AND driver_id IS NULL
    ) INTO batch_exists;
    
    IF NOT batch_exists THEN
        batch_id := batch_uuid;
        driver_id := NULL;
        driver_name := NULL;
        success := false;
        message := 'Batch not found or not ready for assignment';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Find an available driver (not currently assigned to any active batch)
    SELECT d.id, d.name
    INTO selected_driver_id, selected_driver_name
    FROM profiles d
    WHERE d.role = 'driver'
    AND d.id NOT IN (
        SELECT DISTINCT driver_id 
        FROM order_batches 
        WHERE driver_id IS NOT NULL 
        AND status IN ('assigned', 'delivering')
    )
    LIMIT 1;
    
    -- Check if driver is available
    SELECT selected_driver_id IS NOT NULL INTO driver_available;
    
    IF NOT driver_available THEN
        batch_id := batch_uuid;
        driver_id := NULL;
        driver_name := NULL;
        success := false;
        message := 'No available drivers';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Assign driver to batch
    UPDATE order_batches 
    SET 
        driver_id = selected_driver_id,
        status = 'assigned'
    WHERE id = batch_uuid;
    
    -- Return success
    batch_id := batch_uuid;
    driver_id := selected_driver_id;
    driver_name := selected_driver_name;
    success := true;
    message := 'Batch assigned successfully';
    RETURN NEXT;
END;
$$;

-- Function to auto-assign all ready batches
CREATE OR REPLACE FUNCTION auto_assign_all_ready_batches()
RETURNS TABLE(
    batch_id uuid,
    driver_id uuid,
    driver_name text,
    success boolean,
    message text
)
LANGUAGE plpgsql
AS $$
DECLARE
    batch_record RECORD;
    assignment_result RECORD;
BEGIN
    -- Find all ready batches without drivers
    FOR batch_record IN 
        SELECT id, barangay, total_weight
        FROM order_batches 
        WHERE status IN ('pending', 'ready_for_delivery')
        AND driver_id IS NULL
        AND total_weight >= 3500
    LOOP
        -- Try to assign this batch
        FOR assignment_result IN 
            SELECT * FROM auto_assign_batch_to_driver(batch_record.id)
        LOOP
            batch_id := assignment_result.batch_id;
            driver_id := assignment_result.driver_id;
            driver_name := assignment_result.driver_name;
            success := assignment_result.success;
            message := assignment_result.message;
            RETURN NEXT;
        END LOOP;
    END LOOP;
END;
$$;

-- Test the auto-assignment
SELECT 'Auto-assigning all ready batches...' as status;
SELECT * FROM auto_assign_all_ready_batches();

-- Show current batch status
SELECT 'Current batch status:' as info;
SELECT id, barangay, total_weight, status, driver_id, created_at 
FROM order_batches 
ORDER BY created_at DESC;






