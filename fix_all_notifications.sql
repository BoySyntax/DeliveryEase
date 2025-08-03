-- Fix ALL existing notifications and ensure triggers work properly

-- First, let's apply the trigger fixes
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

-- Now fix ALL existing notifications for different order statuses

-- 1. Fix approved orders (Order Verified notifications)
WITH approved_orders AS (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.approval_status,
        o.total
    FROM orders o
    WHERE o.approval_status = 'approved'
),
existing_verified_notifications AS (
    SELECT 
        (n.data->>'orderId')::uuid as order_id,
        n.title
    FROM notifications n
    WHERE n.title = 'Order Verified'
)
INSERT INTO notifications (user_id, title, message, type, data, created_at)
SELECT 
    ao.customer_id,
    'Order Verified',
    'Your order has been verified and is being prepared for delivery.',
    'success',
    json_build_object(
        'orderId', ao.order_id,
        'status', 'verified',
        'total', ao.total
    ),
    NOW()
FROM approved_orders ao
LEFT JOIN existing_verified_notifications en ON ao.order_id = en.order_id
WHERE en.order_id IS NULL;

-- 2. Fix rejected orders (Payment Rejected notifications)
WITH rejected_orders AS (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.approval_status,
        o.total
    FROM orders o
    WHERE o.approval_status = 'rejected'
),
existing_rejected_notifications AS (
    SELECT 
        (n.data->>'orderId')::uuid as order_id,
        n.title
    FROM notifications n
    WHERE n.title = 'Payment Rejected'
)
INSERT INTO notifications (user_id, title, message, type, data, created_at)
SELECT 
    ro.customer_id,
    'Payment Rejected',
    'Your payment has been rejected. Please contact support for more information.',
    'error',
    json_build_object(
        'orderId', ro.order_id,
        'status', 'rejected',
        'total', ro.total
    ),
    NOW()
FROM rejected_orders ro
LEFT JOIN existing_rejected_notifications en ON ro.order_id = en.order_id
WHERE en.order_id IS NULL;

-- 3. Fix delivering orders (Out for Delivery notifications)
WITH delivering_orders AS (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.delivery_status,
        o.total,
        o.estimated_delivery_time
    FROM orders o
    WHERE o.delivery_status = 'delivering'
),
existing_delivering_notifications AS (
    SELECT 
        (n.data->>'orderId')::uuid as order_id,
        n.title
    FROM notifications n
    WHERE n.title = 'Out for Delivery'
)
INSERT INTO notifications (user_id, title, message, type, data, created_at)
SELECT 
    dlo.customer_id,
    'Out for Delivery',
    'Your order is estimated delivery day ' || to_char(dlo.estimated_delivery_time::date, 'Mon DD'),
    'success',
    json_build_object(
        'orderId', dlo.order_id,
        'status', 'delivering',
        'estimatedDelivery', dlo.estimated_delivery_time
    ),
    NOW()
FROM delivering_orders dlo
LEFT JOIN existing_delivering_notifications en ON dlo.order_id = en.order_id
WHERE en.order_id IS NULL;

-- 4. Fix delivered orders (Order Delivered notifications)
WITH delivered_orders AS (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.delivery_status,
        o.total
    FROM orders o
    WHERE o.delivery_status = 'delivered'
),
existing_delivered_notifications AS (
    SELECT 
        (n.data->>'orderId')::uuid as order_id,
        n.title
    FROM notifications n
    WHERE n.title = 'Order Delivered'
)
INSERT INTO notifications (user_id, title, message, type, data, created_at)
SELECT 
    dlo.customer_id,
    'Order Delivered',
    'Your order has been successfully delivered. Thank you for choosing DeliveryEase!',
    'success',
    json_build_object(
        'orderId', dlo.order_id,
        'status', 'delivered'
    ),
    NOW()
FROM delivered_orders dlo
LEFT JOIN existing_delivered_notifications en ON dlo.order_id = en.order_id
WHERE en.order_id IS NULL;

-- Show summary of all fixes
SELECT 
    'Fixed notifications summary' as message,
    'Approved orders' as type,
    COUNT(*) as count
FROM (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.approval_status,
        o.total
    FROM orders o
    WHERE o.approval_status = 'approved'
) ao
LEFT JOIN (
    SELECT 
        (n.data->>'orderId')::uuid as order_id,
        n.title
    FROM notifications n
    WHERE n.title = 'Order Verified'
) en ON ao.order_id = en.order_id
WHERE en.order_id IS NULL

UNION ALL

SELECT 
    'Fixed notifications summary' as message,
    'Rejected orders' as type,
    COUNT(*) as count
FROM (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.approval_status,
        o.total
    FROM orders o
    WHERE o.approval_status = 'rejected'
) ro
LEFT JOIN (
    SELECT 
        (n.data->>'orderId')::uuid as order_id,
        n.title
    FROM notifications n
    WHERE n.title = 'Payment Rejected'
) en ON ro.order_id = en.order_id
WHERE en.order_id IS NULL

UNION ALL

SELECT 
    'Fixed notifications summary' as message,
    'Delivering orders' as type,
    COUNT(*) as count
FROM (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.delivery_status,
        o.total
    FROM orders o
    WHERE o.delivery_status = 'delivering'
) dlo
LEFT JOIN (
    SELECT 
        (n.data->>'orderId')::uuid as order_id,
        n.title
    FROM notifications n
    WHERE n.title = 'Out for Delivery'
) en ON dlo.order_id = en.order_id
WHERE en.order_id IS NULL

UNION ALL

SELECT 
    'Fixed notifications summary' as message,
    'Delivered orders' as type,
    COUNT(*) as count
FROM (
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.delivery_status,
        o.total
    FROM orders o
    WHERE o.delivery_status = 'delivered'
) dlo
LEFT JOIN (
    SELECT 
        (n.data->>'orderId')::uuid as order_id,
        n.title
    FROM notifications n
    WHERE n.title = 'Order Delivered'
) en ON dlo.order_id = en.order_id
WHERE en.order_id IS NULL;

-- Show all notifications for verification
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
JOIN orders o ON (n.data->>'orderId')::uuid = o.id
WHERE n.title IN ('Order Placed', 'Order Verified', 'Payment Rejected', 'Out for Delivery', 'Order Delivered')
ORDER BY n.created_at DESC; 