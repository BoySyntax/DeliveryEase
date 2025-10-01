-- Test script for rejected order email functionality
-- Run this after deploying the main migration

-- 1. Check if the function exists
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_name = 'send_rejected_order_email_notification';

-- 2. Check if the trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'rejected_order_email_trigger';

-- 3. Test the function with a sample order (replace with actual order ID)
-- This will simulate what happens when an order is rejected
DO $$
DECLARE
    test_order_id uuid;
    test_customer_id uuid;
BEGIN
    -- Get a sample order ID (replace with actual order ID from your database)
    SELECT id, customer_id INTO test_order_id, test_customer_id
    FROM orders 
    WHERE approval_status = 'pending' 
    LIMIT 1;
    
    IF test_order_id IS NOT NULL THEN
        RAISE NOTICE 'Testing with order ID: %', test_order_id;
        
        -- Update the order to rejected status (this should trigger the email)
        UPDATE orders 
        SET approval_status = 'rejected' 
        WHERE id = test_order_id;
        
        RAISE NOTICE 'Order % updated to rejected status. Check logs for email notification.', test_order_id;
    ELSE
        RAISE NOTICE 'No pending orders found to test with.';
    END IF;
END $$;
