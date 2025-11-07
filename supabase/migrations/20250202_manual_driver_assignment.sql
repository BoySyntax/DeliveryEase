-- Manual function to assign drivers to ready_for_delivery batches
-- This can be used to manually assign drivers to batches that are ready

-- Function to get all ready_for_delivery batches without drivers
CREATE OR REPLACE FUNCTION get_ready_batches_without_drivers()
RETURNS TABLE(
    batch_id uuid,
    barangay text,
    total_weight decimal,
    max_weight decimal,
    status text,
    created_at timestamp with time zone
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ob.id,
        ob.barangay,
        ob.total_weight,
        ob.max_weight,
        ob.status,
        ob.created_at
    FROM order_batches ob
    WHERE ob.status = 'ready_for_delivery'
    AND ob.driver_id IS NULL
    ORDER BY ob.created_at ASC;
END;
$$;

-- Function to assign a driver to a batch
CREATE OR REPLACE FUNCTION assign_driver_to_batch(batch_uuid uuid, driver_uuid uuid)
RETURNS TABLE(
    batch_id uuid,
    driver_id uuid,
    status text,
    success boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
    batch_exists boolean;
    driver_exists boolean;
BEGIN
    -- Check if batch exists and is ready_for_delivery
    SELECT EXISTS(
        SELECT 1 FROM order_batches 
        WHERE id = batch_uuid 
        AND status = 'ready_for_delivery'
        AND driver_id IS NULL
    ) INTO batch_exists;
    
    -- Check if driver exists
    SELECT EXISTS(
        SELECT 1 FROM profiles 
        WHERE id = driver_uuid 
        AND role = 'driver'
    ) INTO driver_exists;
    
    IF NOT batch_exists THEN
        batch_id := batch_uuid;
        driver_id := driver_uuid;
        status := 'Batch not found or not ready for assignment';
        success := false;
        RETURN NEXT;
        RETURN;
    END IF;
    
    IF NOT driver_exists THEN
        batch_id := batch_uuid;
        driver_id := driver_uuid;
        status := 'Driver not found or not a driver';
        success := false;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Assign driver to batch
    UPDATE order_batches 
    SET 
        driver_id = driver_uuid,
        status = 'assigned'
    WHERE id = batch_uuid;
    
    -- Return success
    batch_id := batch_uuid;
    driver_id := driver_uuid;
    status := 'assigned';
    success := true;
    RETURN NEXT;
END;
$$;

-- Show ready batches without drivers
SELECT 'Ready batches without drivers:' as info;
SELECT * FROM get_ready_batches_without_drivers();

-- Show all drivers
SELECT 'Available drivers:' as info;
SELECT id, name, role 
FROM profiles 
WHERE role = 'driver';























