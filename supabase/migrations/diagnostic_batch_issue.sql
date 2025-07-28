-- DIAGNOSTIC SCRIPT: Check Batch Assignment Issues
-- Run this to understand why orders aren't being batched together

-- 1. Check recent approved orders and their batch assignment
SELECT 
    o.id as order_id,
    o.approval_status,
    o.batch_id,
    o.delivery_address->>'barangay' as barangay,
    o.total_weight,
    o.created_at,
    CASE 
        WHEN o.batch_id IS NULL THEN '❌ NO BATCH'
        ELSE '✅ BATCHED'
    END as batch_status
FROM orders o 
WHERE o.approval_status = 'approved' 
ORDER BY o.created_at DESC 
LIMIT 20;

-- 2. Check current batches and their orders
SELECT 
    b.id as batch_id,
    b.barangay,
    b.status,
    b.total_weight as batch_weight,
    b.max_weight,
    b.created_at,
    COUNT(o.id) as order_count,
    COALESCE(SUM(o.total_weight), 0) as calculated_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status = 'pending'
GROUP BY b.id, b.barangay, b.status, b.total_weight, b.max_weight, b.created_at
ORDER BY b.created_at DESC;

-- 3. Check for approved orders without batch_id (these should be batched)
SELECT 
    COUNT(*) as unbatched_orders,
    delivery_address->>'barangay' as barangay,
    SUM(total_weight) as total_weight
FROM orders 
WHERE approval_status = 'approved' 
AND batch_id IS NULL
GROUP BY delivery_address->>'barangay'
ORDER BY total_weight DESC;

-- 4. Check if the trigger function exists and is working
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders' 
AND trigger_name = 'batch_orders_trigger';

-- 5. Check for any constraint violations
SELECT 
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint 
WHERE conrelid = 'orders'::regclass;

-- 6. Test the batch assignment logic manually
-- This simulates what should happen when an order is approved
DO $$
DECLARE
    test_order_id uuid;
    test_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
BEGIN
    -- Get a test order that's approved but not batched
    SELECT o.id, o.delivery_address->>'barangay'
    INTO test_order_id, test_barangay
    FROM orders o
    WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NULL
    LIMIT 1;
    
    IF test_order_id IS NOT NULL THEN
        RAISE NOTICE 'Testing batch assignment for order % in barangay %', test_order_id, test_barangay;
        
        -- Try to find existing batch
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = test_barangay
        ORDER BY b.created_at ASC
        LIMIT 1;
        
        IF current_batch_id IS NOT NULL THEN
            RAISE NOTICE 'Found existing batch % with weight %', current_batch_id, batch_total_weight;
        ELSE
            RAISE NOTICE 'No existing batch found for barangay %', test_barangay;
        END IF;
    ELSE
        RAISE NOTICE 'No unbatched approved orders found';
    END IF;
END $$; 