-- Fix auto-assignment for batches that reach exactly 3500kg
-- This ensures batches are properly assigned when they reach the minimum threshold

-- First, let's check what batches currently exist and their status
SELECT 'Current batch status before fix:' as info;
SELECT id, barangay, total_weight, max_weight, status, created_at 
FROM order_batches 
ORDER BY created_at DESC;

-- Function to force auto-assignment of all ready batches
CREATE OR REPLACE FUNCTION force_auto_assign_ready_batches()
RETURNS TABLE(
    batch_id uuid,
    barangay text,
    total_weight decimal,
    old_status text,
    new_status text,
    assigned boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
    min_weight_threshold decimal := 3500;
    batch_record RECORD;
    assigned_count INTEGER := 0;
BEGIN
    -- Find all pending batches that have reached the minimum weight
    FOR batch_record IN 
        SELECT ob.id, ob.barangay, ob.total_weight, ob.status
        FROM order_batches ob
        WHERE ob.status = 'pending' 
        AND ob.total_weight >= min_weight_threshold
    LOOP
        -- Update the batch status to ready_for_delivery
        UPDATE order_batches 
        SET status = 'ready_for_delivery'
        WHERE id = batch_record.id;
        
        -- Return the result
        batch_id := batch_record.id;
        barangay := batch_record.barangay;
        total_weight := batch_record.total_weight;
        old_status := batch_record.status;
        new_status := 'ready_for_delivery';
        assigned := true;
        assigned_count := assigned_count + 1;
        RETURN NEXT;
    END LOOP;
    
    -- If no batches were found, return empty result
    IF assigned_count = 0 THEN
        batch_id := NULL;
        barangay := 'No batches ready for assignment';
        total_weight := 0;
        old_status := 'none';
        new_status := 'none';
        assigned := false;
        RETURN NEXT;
    END IF;
END;
$$;

-- Run the force auto-assignment
SELECT 'Force auto-assigning ready batches...' as status;
SELECT * FROM force_auto_assign_ready_batches();

-- Show updated batch status
SELECT 'Updated batch status after fix:' as info;
SELECT id, barangay, total_weight, max_weight, status, created_at 
FROM order_batches 
ORDER BY created_at DESC;

-- Also check if there are any orders without batch_id
SELECT 'Orders without batch_id:' as info;
SELECT o.id, p.name, detect_barangay_from_order_address(o.delivery_address) as barangay, o.total_weight, o.approval_status, o.created_at
FROM orders o
LEFT JOIN profiles p ON p.id = o.customer_id
WHERE o.approval_status = 'approved' 
AND o.batch_id IS NULL
ORDER BY o.created_at DESC;






