-- Add email notification for rejected orders
-- This migration adds email functionality when orders are rejected

-- First, ensure the function exists
CREATE OR REPLACE FUNCTION send_rejected_order_email_notification()
RETURNS TRIGGER AS $$
DECLARE
    customer_email TEXT;
    customer_name TEXT;
    order_items JSON;
    supabase_url TEXT;
    supabase_anon_key TEXT;
    response_status INTEGER;
    response_body TEXT;
BEGIN
    -- Only trigger if approval status changed to rejected
    IF OLD.approval_status = NEW.approval_status OR NEW.approval_status != 'rejected' THEN
        RETURN NEW;
    END IF;
    
    RAISE NOTICE 'Order % rejected, sending email notification', NEW.id;
    
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
    
    -- Get order items for the email
    SELECT json_agg(
        json_build_object(
            'productName', p.name,
            'quantity', oi.quantity,
            'price', oi.price,
            'imageUrl', p.image_url
        )
    )
    INTO order_items
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = NEW.id;
    
    -- Use the service role key to call the edge function
    -- This bypasses RLS and allows the function to be called
    supabase_url := 'https://vpwskrytguoiybqrpebp.supabase.co';
    supabase_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwd3Nrcnl0Z3VvaXlicXJwZWJwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTY3NDg3MiwiZXhwIjoyMDUxMjUwODcyfQ.REPLACE_WITH_YOUR_SERVICE_ROLE_KEY';
    
    RAISE NOTICE 'Calling quick-processor for rejected order %', NEW.id;
    
    -- Call the quick-processor edge function to send email
    SELECT 
        status,
        content
    INTO response_status, response_body
    FROM http((
        'POST',
        supabase_url || '/functions/v1/quick-processor',
        ARRAY[
            ('Authorization', 'Bearer ' || supabase_anon_key)::http_header,
            ('Content-Type', 'application/json')::http_header
        ],
        'application/json',
        json_build_object(
            'orderId', NEW.id,
            'customerName', customer_name,
            'customerEmail', customer_email,
            'status', 'rejected',
            'orderItems', COALESCE(order_items, '[]'::json),
            'totalAmount', NEW.total
        )::text
    ));
    
    -- Log the response
    RAISE NOTICE 'Rejected order email notification sent for order %. Status: %, Response: %', 
        NEW.id, response_status, response_body;
        
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log any errors but don't fail the transaction
        RAISE NOTICE 'Error sending rejected order email notification for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger for rejected orders
DROP TRIGGER IF EXISTS rejected_order_email_trigger ON orders;
CREATE TRIGGER rejected_order_email_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION send_rejected_order_email_notification();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION send_rejected_order_email_notification() TO authenticated;
GRANT EXECUTE ON FUNCTION send_rejected_order_email_notification() TO service_role;

-- Verify the trigger was created
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'rejected_order_email_trigger'
    ) THEN
        RAISE NOTICE 'SUCCESS: Rejected order email trigger created successfully!';
    ELSE
        RAISE NOTICE 'ERROR: Failed to create rejected order email trigger!';
    END IF;
END $$;
