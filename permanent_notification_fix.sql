-- PERMANENT NOTIFICATION FIX
-- This will ensure notifications work reliably and prevent future issues

-- Step 1: Drop all existing triggers and functions to start fresh
DROP TRIGGER IF EXISTS new_order_notification_trigger ON orders;
DROP TRIGGER IF EXISTS order_approval_notification_trigger ON orders;
DROP TRIGGER IF EXISTS delivery_status_notification_trigger ON orders;

DROP FUNCTION IF EXISTS handle_new_order_notification();
DROP FUNCTION IF EXISTS handle_order_approval_notification();
DROP FUNCTION IF EXISTS handle_delivery_status_notification();

-- Step 2: Create a robust notification function that handles all cases
CREATE OR REPLACE FUNCTION create_order_notification(
    p_user_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'info',
    p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Insert notification directly to avoid any RPC issues
    INSERT INTO notifications (user_id, title, message, type, data, created_at)
    VALUES (p_user_id, p_title, p_message, p_type, p_data, NOW());
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating notification: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create robust trigger functions with comprehensive error handling
CREATE OR REPLACE FUNCTION handle_new_order_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Log the trigger execution
    RAISE NOTICE 'Creating new order notification for order % with customer %', NEW.id, NEW.customer_id;
    
    -- Create notification for new order
    PERFORM create_order_notification(
        NEW.customer_id,
        'Order Placed',
        'Your order has been successfully placed and is pending approval.',
        'info',
        json_build_object(
            'orderId', NEW.id,
            'status', 'pending',
            'total', NEW.total
        )
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in new order notification trigger: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
        SELECT create_order_notification(
            NEW.customer_id,
            'Order Verified',
            'Your order has been verified and is being prepared for delivery.',
            'success',
            json_build_object(
                'orderId', NEW.id,
                'status', 'verified',
                'total', NEW.total
            )
        ) INTO notification_created;
        
        IF notification_created THEN
            RAISE NOTICE 'Approved notification created successfully';
        ELSE
            RAISE NOTICE 'Failed to create approved notification';
        END IF;
        
    ELSIF NEW.approval_status = 'rejected' THEN
        RAISE NOTICE 'Creating rejected notification for order %', NEW.id;
        SELECT create_order_notification(
            NEW.customer_id,
            'Payment Rejected',
            'Your payment has been rejected. Please contact support for more information.',
            'error',
            json_build_object(
                'orderId', NEW.id,
                'status', 'rejected',
                'total', NEW.total
            )
        ) INTO notification_created;
        
        IF notification_created THEN
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

CREATE OR REPLACE FUNCTION handle_delivery_status_notification()
RETURNS TRIGGER AS $$
DECLARE
    driver_name text;
    min_delivery_date date;
    max_delivery_date date;
    delivery_range text;
    notification_created BOOLEAN := FALSE;
BEGIN
    -- Always log the trigger execution
    RAISE NOTICE 'Delivery trigger executed: OLD.delivery_status = %, NEW.delivery_status = %, Order ID = %', 
        OLD.delivery_status, NEW.delivery_status, NEW.id;
    
    -- Only trigger if delivery status actually changed
    IF OLD.delivery_status = NEW.delivery_status THEN
        RAISE NOTICE 'No delivery status change, skipping notification';
        RETURN NEW;
    END IF;

    RAISE NOTICE 'Delivery status changed! Creating notification...';

    -- Get driver name if assigned
    IF NEW.driver_id IS NOT NULL THEN
        SELECT p.name INTO driver_name
        FROM profiles p
        WHERE p.id = NEW.driver_id;
    END IF;

    -- Calculate estimated delivery date range (1-3 days)
    IF DATE(NEW.created_at) = CURRENT_DATE THEN
        min_delivery_date := CURRENT_DATE + INTERVAL '1 day';
    ELSE
        min_delivery_date := CURRENT_DATE;
    END IF;
    
    max_delivery_date := min_delivery_date + INTERVAL '2 days';
    
    -- Format the delivery range
    IF min_delivery_date = max_delivery_date THEN
        delivery_range := to_char(min_delivery_date, 'Mon DD');
    ELSIF EXTRACT(MONTH FROM min_delivery_date) = EXTRACT(MONTH FROM max_delivery_date) THEN
        delivery_range := to_char(min_delivery_date, 'Mon') || ' ' || 
                         EXTRACT(DAY FROM min_delivery_date) || '-' || 
                         EXTRACT(DAY FROM max_delivery_date);
    ELSE
        delivery_range := to_char(min_delivery_date, 'Mon DD') || '-' || 
                         to_char(max_delivery_date, 'Mon DD');
    END IF;

    -- Create notification based on delivery status
    CASE NEW.delivery_status
        WHEN 'delivering' THEN
            -- Update the order with estimated delivery time
            UPDATE orders 
            SET estimated_delivery_time = max_delivery_date::timestamptz
            WHERE id = NEW.id;
            
            RAISE NOTICE 'Creating delivering notification for order %', NEW.id;
            SELECT create_order_notification(
                NEW.customer_id,
                'Out for Delivery',
                'Your order is estimated delivery day ' || delivery_range,
                'success',
                json_build_object(
                    'orderId', NEW.id,
                    'status', NEW.delivery_status,
                    'estimatedDelivery', max_delivery_date
                )
            ) INTO notification_created;
            
            IF notification_created THEN
                RAISE NOTICE 'Delivering notification created successfully';
            ELSE
                RAISE NOTICE 'Failed to create delivering notification';
            END IF;
            
        WHEN 'delivered' THEN
            RAISE NOTICE 'Creating delivered notification for order %', NEW.id;
            SELECT create_order_notification(
                NEW.customer_id,
                'Order Delivered',
                'Your order has been successfully delivered. Thank you for choosing DeliveryEase!',
                'success',
                json_build_object(
                    'orderId', NEW.id,
                    'status', NEW.delivery_status
                )
            ) INTO notification_created;
            
            IF notification_created THEN
                RAISE NOTICE 'Delivered notification created successfully';
            ELSE
                RAISE NOTICE 'Failed to create delivered notification';
            END IF;
    END CASE;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in delivery notification trigger: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create the triggers with proper event handling
CREATE TRIGGER new_order_notification_trigger
    AFTER INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_order_notification();

CREATE TRIGGER order_approval_notification_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_order_approval_notification();

CREATE TRIGGER delivery_status_notification_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_delivery_status_notification();

-- Step 5: Create a function to fix any missing notifications
CREATE OR REPLACE FUNCTION fix_missing_notifications()
RETURNS TABLE(
    action TEXT,
    count BIGINT
) AS $$
BEGIN
    -- Fix approved orders without verification notifications
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
    WHERE o.approval_status = 'approved'
    AND NOT EXISTS (
        SELECT 1 FROM notifications n 
        WHERE n.title = 'Order Verified' 
        AND (n.data->>'orderId')::uuid = o.id
    );
    
    GET DIAGNOSTICS count = ROW_COUNT;
    action := 'Fixed approved orders';
    RETURN NEXT;
    
    -- Fix rejected orders without rejection notifications
    INSERT INTO notifications (user_id, title, message, type, data, created_at)
    SELECT 
        o.customer_id,
        'Payment Rejected',
        'Your payment has been rejected. Please contact support for more information.',
        'error',
        json_build_object(
            'orderId', o.id,
            'status', 'rejected',
            'total', o.total
        ),
        NOW()
    FROM orders o
    WHERE o.approval_status = 'rejected'
    AND NOT EXISTS (
        SELECT 1 FROM notifications n 
        WHERE n.title = 'Payment Rejected' 
        AND (n.data->>'orderId')::uuid = o.id
    );
    
    GET DIAGNOSTICS count = ROW_COUNT;
    action := 'Fixed rejected orders';
    RETURN NEXT;
    
    -- Fix delivering orders without delivery notifications
    INSERT INTO notifications (user_id, title, message, type, data, created_at)
    SELECT 
        o.customer_id,
        'Out for Delivery',
        'Your order is estimated delivery day ' || to_char(o.estimated_delivery_time::date, 'Mon DD'),
        'success',
        json_build_object(
            'orderId', o.id,
            'status', 'delivering',
            'estimatedDelivery', o.estimated_delivery_time
        ),
        NOW()
    FROM orders o
    WHERE o.delivery_status = 'delivering'
    AND NOT EXISTS (
        SELECT 1 FROM notifications n 
        WHERE n.title = 'Out for Delivery' 
        AND (n.data->>'orderId')::uuid = o.id
    );
    
    GET DIAGNOSTICS count = ROW_COUNT;
    action := 'Fixed delivering orders';
    RETURN NEXT;
    
    -- Fix delivered orders without delivery completion notifications
    INSERT INTO notifications (user_id, title, message, type, data, created_at)
    SELECT 
        o.customer_id,
        'Order Delivered',
        'Your order has been successfully delivered. Thank you for choosing DeliveryEase!',
        'success',
        json_build_object(
            'orderId', o.id,
            'status', 'delivered'
        ),
        NOW()
    FROM orders o
    WHERE o.delivery_status = 'delivered'
    AND NOT EXISTS (
        SELECT 1 FROM notifications n 
        WHERE n.title = 'Order Delivered' 
        AND (n.data->>'orderId')::uuid = o.id
    );
    
    GET DIAGNOSTICS count = ROW_COUNT;
    action := 'Fixed delivered orders';
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Run the fix function to handle any existing issues
SELECT * FROM fix_missing_notifications();

-- Step 7: Verify everything is working
SELECT 
    'Trigger verification' as check_type,
    trigger_name,
    event_manipulation
FROM information_schema.triggers 
WHERE trigger_name IN (
    'new_order_notification_trigger',
    'order_approval_notification_trigger',
    'delivery_status_notification_trigger'
);

-- Step 8: Show current notification status
SELECT 
    'Current notifications' as check_type,
    n.title,
    COUNT(*) as count
FROM notifications n
WHERE n.title IN ('Order Placed', 'Order Verified', 'Payment Rejected', 'Out for Delivery', 'Order Delivered')
GROUP BY n.title
ORDER BY n.title; 