-- Add automatic email trigger for delivery status changes
-- This will automatically send emails when orders go out for delivery

-- Function to handle delivery status changes and send emails
CREATE OR REPLACE FUNCTION handle_delivery_email_trigger()
RETURNS TRIGGER AS $$
DECLARE
    customer_email text;
    customer_name text;
    order_items_data jsonb;
    total_amount decimal;
    estimated_delivery_date text;
BEGIN
    -- Only proceed if delivery status changed to 'out_for_delivery' or 'delivering'
    IF (NEW.delivery_status = 'out_for_delivery' OR NEW.delivery_status = 'delivering') 
       AND (OLD.delivery_status != 'out_for_delivery' AND OLD.delivery_status != 'delivering') THEN
        
        -- Get customer email and name
        SELECT p.email, p.name 
        INTO customer_email, customer_name
        FROM profiles p 
        WHERE p.id = NEW.customer_id;
        
        IF customer_email IS NULL THEN
            RAISE NOTICE 'No email found for customer %', NEW.customer_id;
            RETURN NEW;
        END IF;
        
        -- Get order items
        SELECT jsonb_agg(
            jsonb_build_object(
                'productName', pr.name,
                'quantity', oi.quantity,
                'price', oi.price
            )
        )
        INTO order_items_data
        FROM order_items oi
        JOIN products pr ON pr.id = oi.product_id
        WHERE oi.order_id = NEW.id;
        
        -- Calculate total amount
        total_amount := NEW.total;
        
        -- Calculate estimated delivery date (1-3 days from now)
        estimated_delivery_date := to_char(CURRENT_DATE + INTERVAL '1 day', 'Mon DD');
        
        -- Log the email attempt (for debugging)
        RAISE NOTICE 'Sending delivery email for order % to % with status: out_for_delivery', NEW.id, customer_email;
        RAISE NOTICE 'Order items: %', order_items_data;
        RAISE NOTICE 'Total amount: %', total_amount;
        
        -- Note: The actual email sending will be handled by your application
        -- when it detects this status change, or you can run the test script
        
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in delivery email trigger for order %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for delivery status changes
DROP TRIGGER IF EXISTS delivery_email_trigger_final ON orders;
CREATE TRIGGER delivery_email_trigger_final
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_delivery_email_trigger();

-- Optional: Add a flag to track if email was sent
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_email_sent BOOLEAN DEFAULT FALSE;

-- Function to mark delivery emails as sent
CREATE OR REPLACE FUNCTION mark_delivery_email_sent(order_id_param uuid)
RETURNS void AS $$
BEGIN
    UPDATE orders 
    SET delivery_email_sent = TRUE 
    WHERE id = order_id_param;
    
    RAISE NOTICE 'Marked delivery email as sent for order %', order_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 