-- Simple notification fix to test the trigger

-- First, let's check if the trigger exists and is working
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'order_approval_notification_trigger';

-- Check if the function exists
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_name = 'handle_order_approval_notification';

-- Let's manually test the trigger by updating an order
-- First, let's see what orders we have
SELECT 
    id,
    customer_id,
    approval_status,
    delivery_status,
    created_at,
    updated_at
FROM orders 
ORDER BY created_at DESC 
LIMIT 5;

-- Now let's manually create a notification for an approved order to test
-- Replace 'ORDER_ID_HERE' with an actual order ID from your database
-- SELECT create_notification(
--     'CUSTOMER_ID_HERE',  -- Replace with actual customer ID
--     'Order Verified',
--     'Your order has been verified and is being prepared for delivery.',
--     'success',
--     json_build_object(
--         'orderId', 'ORDER_ID_HERE',  -- Replace with actual order ID
--         'status', 'verified',
--         'total', 100
--     )
-- );

-- Let's also check what notifications currently exist
SELECT 
    n.id,
    n.user_id,
    n.title,
    n.message,
    n.type,
    n.created_at,
    o.id as order_id,
    o.approval_status,
    o.delivery_status
FROM notifications n
LEFT JOIN orders o ON (n.data->>'orderId')::uuid = o.id
ORDER BY n.created_at DESC;

-- Let's recreate the trigger with more debugging
DROP TRIGGER IF EXISTS order_approval_notification_trigger ON orders;

CREATE OR REPLACE FUNCTION handle_order_approval_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Always log the trigger execution
    RAISE NOTICE 'Trigger executed: OLD.approval_status = %, NEW.approval_status = %, Order ID = %', 
        OLD.approval_status, NEW.approval_status, NEW.id;
    
    -- Only trigger if approval status actually changed
    IF OLD.approval_status = NEW.approval_status THEN
        RAISE NOTICE 'No status change, skipping notification';
        RETURN NEW;
    END IF;

    RAISE NOTICE 'Status changed! Creating notification...';

    -- Create notification based on status change
    IF NEW.approval_status = 'approved' THEN
        RAISE NOTICE 'Creating approved notification for order %', NEW.id;
        PERFORM create_notification(
            NEW.customer_id,
            'Order Verified',
            'Your order has been verified and is being prepared for delivery.',
            'success',
            json_build_object(
                'orderId', NEW.id,
                'status', 'verified',
                'total', NEW.total
            )
        );
        RAISE NOTICE 'Approved notification created successfully';
    ELSIF NEW.approval_status = 'rejected' THEN
        RAISE NOTICE 'Creating rejected notification for order %', NEW.id;
        PERFORM create_notification(
            NEW.customer_id,
            'Payment Rejected',
            'Your payment has been rejected. Please contact support for more information.',
            'error',
            json_build_object(
                'orderId', NEW.id,
                'status', 'rejected',
                'total', NEW.total
            )
        );
        RAISE NOTICE 'Rejected notification created successfully';
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating approval notification for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER order_approval_notification_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_order_approval_notification();

-- Verify the trigger is created
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'order_approval_notification_trigger'; 