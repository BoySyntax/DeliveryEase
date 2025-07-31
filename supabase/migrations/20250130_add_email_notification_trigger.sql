-- Create function to send email notifications when order status changes
CREATE OR REPLACE FUNCTION send_order_status_email()
RETURNS TRIGGER AS $$
DECLARE
    customer_email text;
    customer_name text;
    order_items json;
    delivery_address text;
    supabase_url text;
    supabase_anon_key text;
BEGIN
    -- Only send email if status actually changed
    IF OLD.approval_status = NEW.approval_status AND OLD.delivery_status = NEW.delivery_status THEN
        RETURN NEW;
    END IF;

    -- Get customer email and name
    SELECT u.email, p.name
    INTO customer_email, customer_name
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
    WHERE u.id = NEW.customer_id;

    -- If no email found, don't send notification
    IF customer_email IS NULL THEN
        RAISE NOTICE 'No email found for customer %', NEW.customer_id;
        RETURN NEW;
    END IF;

    -- Get order items
    SELECT json_agg(
        json_build_object(
            'name', p.name,
            'quantity', oi.quantity,
            'price', oi.price
        )
    )
    INTO order_items
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = NEW.id;

    -- Format delivery address
    IF NEW.delivery_address IS NOT NULL THEN
        delivery_address := 
            COALESCE(NEW.delivery_address->>'street_address', '') || ', ' ||
            COALESCE(NEW.delivery_address->>'barangay', '') || ', ' ||
            COALESCE(NEW.delivery_address->>'city', '') || ', ' ||
            COALESCE(NEW.delivery_address->>'province', '');
    END IF;

    -- Get Supabase configuration
    supabase_url := current_setting('app.settings.supabase_url', true);
    supabase_anon_key := current_setting('app.settings.supabase_anon_key', true);

    -- Determine which status changed and send appropriate email
    IF OLD.approval_status != NEW.approval_status THEN
        -- Send approval status email
        PERFORM send_email_notification(
            customer_email,
            NEW.id,
            customer_name,
            NEW.approval_status,
            NEW.total,
            order_items,
            delivery_address
        );
    ELSIF OLD.delivery_status != NEW.delivery_status THEN
        -- Send delivery status email
        PERFORM send_email_notification(
            customer_email,
            NEW.id,
            customer_name,
            NEW.delivery_status,
            NEW.total,
            order_items,
            delivery_address
        );
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error sending email notification for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Helper function to actually send the email via HTTP request
CREATE OR REPLACE FUNCTION send_email_notification(
    customer_email text,
    order_id uuid,
    customer_name text,
    status text,
    order_total numeric,
    order_items json,
    delivery_address text
)
RETURNS void AS $$
DECLARE
    response_status int;
    response_body text;
BEGIN
    -- Make HTTP request to the email function
    SELECT status, content
    INTO response_status, response_body
    FROM http((
        'POST',
        current_setting('app.settings.supabase_url', true) || '/functions/v1/send-order-notification',
        ARRAY[
            ('Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key', true))::http_header,
            ('Content-Type', 'application/json')::http_header
        ],
        'application/json',
        json_build_object(
            'to', customer_email,
            'orderId', order_id::text,
            'customerName', customer_name,
            'status', status,
            'orderTotal', order_total,
            'items', order_items,
            'deliveryAddress', delivery_address
        )::text
    ));

    -- Log the response
    RAISE NOTICE 'Email notification sent for order % to %: status=%, response=%', 
        order_id, customer_email, response_status, response_body;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Failed to send email notification for order %: %', order_id, SQLERRM;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;

-- Create trigger to automatically send emails when order status changes
DROP TRIGGER IF EXISTS order_status_email_trigger ON orders;
CREATE TRIGGER order_status_email_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION send_order_status_email();

-- Add settings for Supabase URL and key (these will be set via environment variables)
-- You can set these in your Supabase dashboard under Settings > API
-- Or via environment variables in your deployment 