-- Investigate why database is always doubling the weight (+1000kg)
-- This will help us find the root cause of the weight duplication bug

-- Check if there are duplicate orders in the same batch
SELECT 
    'DUPLICATE ORDERS CHECK' as check_type,
    b.id as batch_id,
    b.barangay,
    o.id as order_id,
    o.approval_status,
    COUNT(*) as duplicate_count
FROM order_batches b
JOIN orders o ON o.batch_id = b.id
WHERE b.status IN ('pending', 'assigned')
GROUP BY b.id, b.barangay, o.id, o.approval_status
HAVING COUNT(*) > 1
ORDER BY b.created_at DESC;

-- Check if the batch_approved_orders trigger is being called multiple times
-- Look for orders that might have been processed multiple times
SELECT 
    'TRIGGER EXECUTION CHECK' as check_type,
    o.id as order_id,
    o.batch_id,
    o.approval_status,
    o.total_weight as order_weight,
    o.created_at,
    o.updated_at,
    -- Check if this order was updated multiple times
    COUNT(*) as update_count
FROM orders o
WHERE o.batch_id IS NOT NULL
GROUP BY o.id, o.batch_id, o.approval_status, o.total_weight, o.created_at, o.updated_at
ORDER BY o.created_at DESC;

-- Check the batch_approved_orders function for potential double calculation
-- Look at the function definition
SELECT 
    'FUNCTION DEFINITION' as check_type,
    proname as function_name,
    prosrc as function_source
FROM pg_proc 
WHERE proname = 'batch_approved_orders';

-- Check if there are multiple triggers on the orders table
SELECT 
    'TRIGGERS ON ORDERS TABLE' as check_type,
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders';

-- Check if the batch weight is being updated by multiple sources
-- Look for any other functions that might update batch weights
SELECT 
    'FUNCTIONS THAT UPDATE BATCH WEIGHTS' as check_type,
    proname as function_name,
    prosrc as function_source
FROM pg_proc 
WHERE prosrc LIKE '%order_batches%' 
AND prosrc LIKE '%total_weight%'
AND proname != 'batch_approved_orders';

-- Check if there are any foreign key constraints or cascading updates
-- that might be causing duplicate weight calculations
SELECT 
    'FOREIGN KEY CONSTRAINTS' as check_type,
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND (tc.table_name = 'orders' OR tc.table_name = 'order_batches');

-- Check if there are any RLS policies that might be affecting the data
SELECT 
    'RLS POLICIES' as check_type,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename IN ('orders', 'order_batches', 'order_items'); 