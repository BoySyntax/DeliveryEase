-- Simple test to identify why weights are being doubled
-- Run this to see what's causing the +1000kg issue

-- Test 1: Check if the batch_approved_orders function has a double calculation bug
-- Look at the specific part where it updates batch weight
SELECT 
    'FUNCTION BUG CHECK' as test,
    prosrc as function_code
FROM pg_proc 
WHERE proname = 'batch_approved_orders';

-- Test 2: Check if there are multiple triggers firing
SELECT 
    'MULTIPLE TRIGGERS' as test,
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders';

-- Test 3: Check if the function is adding weight instead of recalculating
-- Look for the line that updates batch total_weight
SELECT 
    'WEIGHT UPDATE LOGIC' as test,
    CASE 
        WHEN prosrc LIKE '%batch_total_weight + NEW.total_weight%' THEN 'ADDING WEIGHT (BUG)'
        WHEN prosrc LIKE '%recalculating from all orders%' THEN 'RECALCULATING (CORRECT)'
        ELSE 'UNKNOWN METHOD'
    END as update_method
FROM pg_proc 
WHERE proname = 'batch_approved_orders';

-- Test 4: Check if there's a recursive trigger issue
-- Look for triggers that might call each other
SELECT 
    'RECURSIVE TRIGGER CHECK' as test,
    t1.trigger_name as trigger1,
    t2.trigger_name as trigger2,
    'POTENTIAL RECURSION' as issue
FROM information_schema.triggers t1
JOIN information_schema.triggers t2 ON t1.event_object_table = t2.event_object_table
WHERE t1.trigger_name != t2.trigger_name
AND t1.event_object_table = 'orders';

-- Test 5: Check the actual batch weight calculation logic
-- This will show us exactly how the weight is being calculated
SELECT 
    'CURRENT BATCH WEIGHT CALCULATION' as test,
    b.id,
    b.total_weight as current_weight,
    -- Calculate what it should be
    COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id)
    ), 0) as should_be_weight,
    -- Check if it's exactly double
    CASE 
        WHEN b.total_weight = 2 * COALESCE(SUM(
            (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
             FROM order_items oi
             JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = o.id)
        ), 0) THEN 'EXACTLY DOUBLE (BUG CONFIRMED)'
        ELSE 'NOT DOUBLE'
    END as analysis
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status IN ('pending', 'assigned')
GROUP BY b.id, b.total_weight
ORDER BY b.created_at DESC; 