-- Fix verification notification for specific order
-- This will ensure the trigger works and add missing notifications

-- First, let's check the current status of the specific order
SELECT 
    id,
    customer_id,
    approval_status,
    delivery_status,
    created_at
FROM orders 
WHERE id = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8';

-- Check if there's already a verification notification for this order
SELECT 
    id,
    user_id,
    title,
    message,
    created_at
FROM notifications 
WHERE (data->>'orderId')::uuid = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8'
ORDER BY created_at DESC;

-- Drop and recreate the approval notification trigger to ensure it works
DROP TRIGGER IF EXISTS order_approval_notification_trigger ON orders;

CREATE OR REPLACE FUNCTION handle_order_approval_notification()
RETURNS TRIGGER AS $$
DECLARE
    notification_created BOOLEAN := FALSE;
BEGIN
    -- Always log the trigger execution
    RAISE NOTICE 'Approval trigger executed: OLD.approval_status = %, NEW.approval_status = %, Order ID = %', 
        OLD.approval_status, NEW.approval_status, NEW.id;
    
    -- Only trigger if approval status actually changed
    IF OLD.approval_status = NEW.approval_status THEN
        RAISE NOTICE 'No approval status change, skipping notification';
        RETURN NEW;
    END IF;

    RAISE NOTICE 'Approval status changed! Creating notification...';

    -- Create notification based on status change
    IF NEW.approval_status = 'approved' THEN
        RAISE NOTICE 'Creating approved notification for order %', NEW.id;
        
        -- Insert notification directly
        INSERT INTO notifications (user_id, title, message, type, data, created_at)
        VALUES (
            NEW.customer_id,
            'Order Verified',
            'Your order has been verified and is being prepared for delivery.',
            'success',
            json_build_object(
                'orderId', NEW.id,
                'status', 'verified',
                'total', NEW.total
            ),
            NOW()
        );
        
        GET DIAGNOSTICS notification_created = ROW_COUNT;
        
        IF notification_created > 0 THEN
            RAISE NOTICE 'Approved notification created successfully';
        ELSE
            RAISE NOTICE 'Failed to create approved notification';
        END IF;
        
    ELSIF NEW.approval_status = 'rejected' THEN
        RAISE NOTICE 'Creating rejected notification for order %', NEW.id;
        
        -- Insert notification directly
        INSERT INTO notifications (user_id, title, message, type, data, created_at)
        VALUES (
            NEW.customer_id,
            'Payment Rejected',
            'Your payment has been rejected. Please contact support for more information.',
            'error',
            json_build_object(
                'orderId', NEW.id,
                'status', 'rejected',
                'total', NEW.total
            ),
            NOW()
        );
        
        GET DIAGNOSTICS notification_created = ROW_COUNT;
        
        IF notification_created > 0 THEN
            RAISE NOTICE 'Rejected notification created successfully';
        ELSE
            RAISE NOTICE 'Failed to create rejected notification';
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in approval notification trigger: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER order_approval_notification_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_order_approval_notification();

-- Now let's manually add the missing verification notification for this specific order
INSERT INTO notifications (user_id, title, message, type, data, created_at)
SELECT 
    o.customer_id,
    'Order Verified',
    'Your order has been verified and is being prepared for delivery.',
    'success',
    json_build_object(
        'orderId', o.id,
        'status', 'verified',
        'total', o.total
    ),
    NOW()
FROM orders o
WHERE o.id = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8'
AND o.approval_status = 'approved'
AND NOT EXISTS (
    SELECT 1 FROM notifications n 
    WHERE n.title = 'Order Verified' 
    AND (n.data->>'orderId')::uuid = o.id
);

-- Test the trigger by updating the order (this should create a notification if it doesn't exist)
UPDATE orders 
SET approval_status = 'approved'
WHERE id = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8'
AND approval_status = 'approved';

-- Show the results
SELECT 
    'Order status' as check_type,
    id,
    approval_status,
    delivery_status
FROM orders 
WHERE id = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8';

SELECT 
    'Notifications for this order' as check_type,
    id,
    title,
    message,
    created_at
FROM notifications 
WHERE (data->>'orderId')::uuid = 'dfec3398-c4ff-492f-afc8-e84d9b1a90b8'
ORDER BY created_at DESC; 