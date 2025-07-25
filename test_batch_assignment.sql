-- Test script to manually test batch assignment
-- This will help us understand why only one order is being batched

-- 1. First, let's see what orders are currently approved but not batched
SELECT 
    'Orders approved but not batched:' as status,
    id,
    approval_status,
    batch_id,
    total_weight,
    delivery_address->>'barangay' as barangay
FROM orders 
WHERE approval_status = 'approved' 
AND batch_id IS NULL;

-- 2. Let's manually trigger the batch assignment for one order
-- First, get an order that's approved but not batched
DO $$
DECLARE
    test_order_id uuid;
    test_order RECORD;
BEGIN
    -- Get the first approved order without batch
    SELECT id, delivery_address, total_weight 
    INTO test_order
    FROM orders 
    WHERE approval_status = 'approved' 
    AND batch_id IS NULL
    LIMIT 1;
    
    IF test_order.id IS NOT NULL THEN
        RAISE NOTICE 'Testing batch assignment for order: %', test_order.id;
        RAISE NOTICE 'Delivery address: %', test_order.delivery_address;
        RAISE NOTICE 'Total weight: %', test_order.total_weight;
        
        -- Manually call the batch assignment function
        -- This simulates what the trigger should do
        UPDATE orders 
        SET approval_status = 'approved'  -- This should trigger the batch assignment
        WHERE id = test_order.id;
        
        RAISE NOTICE 'Batch assignment triggered for order: %', test_order.id;
    ELSE
        RAISE NOTICE 'No approved orders without batch found';
    END IF;
END $$;

-- 3. Check the result
SELECT 
    'After manual trigger:' as status,
    id,
    approval_status,
    batch_id,
    total_weight,
    delivery_address->>'barangay' as barangay
FROM orders 
WHERE approval_status = 'approved'
ORDER BY created_at DESC;

-- 4. Check if any new batches were created
SELECT 
    'Batches after trigger:' as status,
    id,
    barangay,
    total_weight,
    max_weight,
    status,
    created_at
FROM order_batches
ORDER BY created_at DESC; 