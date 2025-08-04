-- Function to send email notification when order status changes
CREATE OR REPLACE FUNCTION send_order_status_email_notification()
RETURNS TRIGGER AS $$
DECLARE
    customer_email TEXT;
    customer_name TEXT;
    supabase_url TEXT;
    supabase_anon_key TEXT;
    response_status INTEGER;
    response_body TEXT;
    order_status TEXT;
BEGIN
    -- Determine the order status based on approval_status and delivery_status
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        order_status := 'verified';
    ELSIF NEW.delivery_status = 'delivering' AND OLD.delivery_status != 'delivering' THEN
        order_status := 'out_for_delivery';
    ELSE
        RETURN NEW; -- No relevant status change
    END IF;
    
    -- Get customer email and name from auth.users and profiles
    SELECT 
        au.email,
        COALESCE(p.name, 'Customer')
    INTO customer_email, customer_name
    FROM auth.users au
    LEFT JOIN profiles p ON p.id = au.id
    WHERE au.id = NEW.customer_id;
    
    -- If no customer email found, log and return
    IF customer_email IS NULL THEN
        RAISE NOTICE 'No email found for customer %', NEW.customer_id;
        RETURN NEW;
    END IF;
    
    -- Get Supabase URL and anon key from environment
    supabase_url := current_setting('app.settings.supabase_url', true);
    supabase_anon_key := current_setting('app.settings.supabase_anon_key', true);
    
    -- If environment variables are not set, use defaults for local development
    IF supabase_url IS NULL THEN
        supabase_url := 'http://127.0.0.1:54321';
    END IF;
    
    -- Call the edge function to send email
    SELECT 
        status,
        content
    INTO response_status, response_body
    FROM http((
        'POST',
        supabase_url || '/functions/v1/send-order-notification',
        ARRAY[
            ('Authorization', 'Bearer ' || supabase_anon_key)::http_header,
            ('Content-Type', 'application/json')::http_header
        ],
        'application/json',
        json_build_object(
            'orderId', NEW.id,
            'customerName', customer_name,
            'customerEmail', customer_email,
            'status', order_status,
            'estimatedDeliveryDate', CASE 
                WHEN order_status = 'out_for_delivery' 
                THEN (CURRENT_DATE + INTERVAL '1 day')::text
                ELSE NULL
            END
        )::text
    ));
    
    -- Log the response
    RAISE NOTICE 'Email notification sent for order %. Status: %, Response: %', 
        NEW.id, response_status, response_body;
        
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log any errors but don't fail the transaction
        RAISE NOTICE 'Error sending email notification for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS order_status_email_trigger ON orders;
CREATE TRIGGER order_status_email_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION send_order_status_email_notification();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION send_order_status_email_notification() TO authenticated;
GRANT EXECUTE ON FUNCTION send_order_status_email_notification() TO service_role; 