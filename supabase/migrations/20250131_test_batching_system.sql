-- TEST: Verify that the batching system is working correctly
-- Run this after the permanent solution to test it

-- Test function to verify batching is working
CREATE OR REPLACE FUNCTION test_batching_system()
RETURNS TABLE(
    test_description text,
    result text,
    success boolean
) AS $$
BEGIN
    -- Test 1: Check if triggers exist
    RETURN QUERY
    SELECT 
        'Check if batch_approved_orders trigger exists'::text as test_description,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'batch_approved_orders_trigger') 
            THEN 'Trigger exists'::text
            ELSE 'Trigger missing'::text
        END as result,
        EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'batch_approved_orders_trigger') as success;
    
    -- Test 2: Check if auto-assignment trigger exists
    RETURN QUERY
    SELECT 
        'Check if auto_assign_ready_batches trigger exists'::text as test_description,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'auto_assign_ready_batches_trigger') 
            THEN 'Trigger exists'::text
            ELSE 'Trigger missing'::text
        END as result,
        EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'auto_assign_ready_batches_trigger') as success;
    
    -- Test 3: Test barangay extraction function
    RETURN QUERY
    SELECT 
        'Test barangay extraction from frontend address'::text as test_description,
        get_barangay_from_order('{"barangay": "Patag, Misamis Oriental", "address": "Test Address"}'::jsonb) as result,
        (get_barangay_from_order('{"barangay": "Patag, Misamis Oriental", "address": "Test Address"}'::jsonb) = 'Patag, Misamis Oriental') as success;
    
    -- Test 4: Test barangay extraction from address string
    RETURN QUERY
    SELECT 
        'Test barangay extraction from address string'::text as test_description,
        get_barangay_from_order('{"address": "FJQ9+J7X, Cagayan De Oro City, • Misamis Oriental, Philippines, Patag, Misamis Oriental"}'::jsonb) as result,
        (get_barangay_from_order('{"address": "FJQ9+J7X, Cagayan De Oro City, • Misamis Oriental, Philippines, Patag, Misamis Oriental"}'::jsonb) = 'Patag, Misamis Oriental') as success;
    
    -- Test 5: Check current batch status
    RETURN QUERY
    SELECT 
        'Check current batch count'::text as test_description,
        (SELECT COUNT(*)::text FROM order_batches) as result,
        (SELECT COUNT(*) > 0 FROM order_batches) as success;
    
    -- Test 6: Check for unknown batches
    RETURN QUERY
    SELECT 
        'Check for unknown batches'::text as test_description,
        (SELECT COUNT(*)::text FROM order_batches WHERE barangay = 'Unknown' OR barangay = 'Unknown Location') as result,
        (SELECT COUNT(*) = 0 FROM order_batches WHERE barangay = 'Unknown' OR barangay = 'Unknown Location') as success;
    
    -- Test 7: Check for orders without batch_id
    RETURN QUERY
    SELECT 
        'Check for approved orders without batch_id'::text as test_description,
        (SELECT COUNT(*)::text FROM orders WHERE approval_status = 'approved' AND batch_id IS NULL) as result,
        (SELECT COUNT(*) = 0 FROM orders WHERE approval_status = 'approved' AND batch_id IS NULL) as success;
END;
$$ LANGUAGE plpgsql;

-- Run the test
SELECT * FROM test_batching_system();

-- Also show current batch status
SELECT 
    id,
    barangay,
    total_weight,
    max_weight,
    status,
    created_at
FROM order_batches 
ORDER BY created_at DESC 
LIMIT 10;






