-- Update existing notification from "Order Placed" to "Order Verified"
-- This will change the existing notification instead of creating a new one

-- First, let's see what notifications exist for this order
SELECT 
    id,
    user_id,
    title,
    message,
    type,
    created_at
FROM notifications 
WHERE (data->>'orderId')::uuid = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8'
ORDER BY created_at DESC;

-- Update the "Order Placed" notification to "Order Verified"
UPDATE notifications 
SET 
    title = 'Order Verified',
    message = 'Your order has been verified and is being prepared for delivery.',
    type = 'success',
    data = jsonb_set(data, '{status}', '"verified"')
WHERE (data->>'orderId')::uuid = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8'
AND title = 'Order Placed';

-- Show the updated results
SELECT 
    'Updated notifications' as check_type,
    id,
    title,
    message,
    type,
    created_at
FROM notifications 
WHERE (data->>'orderId')::uuid = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8'
ORDER BY created_at DESC;

-- Now let's create a trigger function that will update existing notifications instead of creating new ones
CREATE OR REPLACE FUNCTION handle_order_approval_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Always log the trigger execution
    RAISE NOTICE 'Approval trigger executed: OLD.approval_status = %, NEW.approval_status = %, Order ID = %', 
        OLD.approval_status, NEW.approval_status, NEW.id;
    
    -- Only trigger if approval status actually changed
    IF OLD.approval_status = NEW.approval_status THEN
        RAISE NOTICE 'No approval status change, skipping notification update';
        RETURN NEW;
    END IF;

    RAISE NOTICE 'Approval status changed! Updating notification...';

    -- Update existing notification based on status change
    IF NEW.approval_status = 'approved' THEN
        RAISE NOTICE 'Updating notification to "Order Verified" for order %', NEW.id;
        
        -- Update existing "Order Placed" notification to "Order Verified"
        UPDATE notifications 
        SET 
            title = 'Order Verified',
            message = 'Your order has been verified and is being prepared for delivery.',
            type = 'success',
            data = jsonb_set(data, '{status}', '"verified"')
        WHERE (data->>'orderId')::uuid = NEW.id
        AND title = 'Order Placed';
        
        RAISE NOTICE 'Notification updated to "Order Verified" successfully';
        
    ELSIF NEW.approval_status = 'rejected' THEN
        RAISE NOTICE 'Updating notification to "Payment Rejected" for order %', NEW.id;
        
        -- Update existing "Order Placed" notification to "Payment Rejected"
        UPDATE notifications 
        SET 
            title = 'Payment Rejected',
            message = 'Your payment has been rejected. Please contact support for more information.',
            type = 'error',
            data = jsonb_set(data, '{status}', '"rejected"')
        WHERE (data->>'orderId')::uuid = NEW.id
        AND title = 'Order Placed';
        
        RAISE NOTICE 'Notification updated to "Payment Rejected" successfully';
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in approval notification trigger: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS order_approval_notification_trigger ON orders;
CREATE TRIGGER order_approval_notification_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_order_approval_notification();

-- Test the trigger by updating the order (this should update the existing notification)
UPDATE orders 
SET approval_status = 'approved'
WHERE id = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8'
AND approval_status = 'approved';

-- Final check - show all notifications for this order
SELECT 
    'Final notifications for this order' as check_type,
    id,
    title,
    message,
    type,
    created_at
FROM notifications 
WHERE (data->>'orderId')::uuid = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8'
ORDER BY created_at DESC; 