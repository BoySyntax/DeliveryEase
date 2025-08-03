-- Apply notification triggers to ensure they're working properly

-- First, let's check if the triggers exist
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name IN (
    'new_order_notification_trigger',
    'order_approval_notification_trigger',
    'delivery_status_notification_trigger'
);

-- If triggers don't exist or are not working, recreate them
-- Drop existing triggers first
DROP TRIGGER IF EXISTS new_order_notification_trigger ON orders;
DROP TRIGGER IF EXISTS order_approval_notification_trigger ON orders;
DROP TRIGGER IF EXISTS delivery_status_notification_trigger ON orders;

-- Drop existing functions
DROP FUNCTION IF EXISTS handle_new_order_notification();
DROP FUNCTION IF EXISTS handle_order_approval_notification();
DROP FUNCTION IF EXISTS handle_delivery_status_notification();

-- Recreate the functions with debugging
CREATE OR REPLACE FUNCTION handle_new_order_notification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE NOTICE 'Creating notification for new order % with customer %', NEW.id, NEW.customer_id;
    
    PERFORM create_notification(
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
        RAISE NOTICE 'Error creating new order notification for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION handle_order_approval_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger if approval status actually changed
    IF OLD.approval_status = NEW.approval_status THEN
        RETURN NEW;
    END IF;

    RAISE NOTICE 'Approval status changed from % to % for order %', OLD.approval_status, NEW.approval_status, NEW.id;

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
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating approval notification for order %: %', NEW.id, SQLERRM;
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
BEGIN
    -- Only trigger if delivery status actually changed
    IF OLD.delivery_status = NEW.delivery_status THEN
        RETURN NEW;
    END IF;

    RAISE NOTICE 'Delivery status changed from % to % for order %', OLD.delivery_status, NEW.delivery_status, NEW.id;

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
            UPDATE orders 
            SET estimated_delivery_time = max_delivery_date::timestamptz
            WHERE id = NEW.id;
            
            RAISE NOTICE 'Creating delivering notification for order %', NEW.id;
            PERFORM create_notification(
                NEW.customer_id,
                'Out for Delivery',
                'Your order is estimated delivery day ' || delivery_range,
                'success',
                json_build_object(
                    'orderId', NEW.id,
                    'status', NEW.delivery_status,
                    'estimatedDelivery', max_delivery_date
                )
            );
        WHEN 'delivered' THEN
            RAISE NOTICE 'Creating delivered notification for order %', NEW.id;
            PERFORM create_notification(
                NEW.customer_id,
                'Order Delivered',
                'Your order has been successfully delivered. Thank you for choosing DeliveryEase!',
                'success',
                json_build_object(
                    'orderId', NEW.id,
                    'status', NEW.delivery_status
                )
            );
    END CASE;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating delivery notification for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the triggers
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

-- Verify triggers are created
SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE trigger_name IN (
    'new_order_notification_trigger',
    'order_approval_notification_trigger',
    'delivery_status_notification_trigger'
);

-- Test the trigger by updating an existing order (replace ORDER_ID with actual order ID)
-- UPDATE orders 
-- SET approval_status = 'approved'
-- WHERE id = 'ORDER_ID_HERE'; 