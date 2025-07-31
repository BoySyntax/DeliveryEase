-- Remove notification-related columns from orders table
ALTER TABLE orders 
DROP COLUMN IF EXISTS notification_read,
DROP COLUMN IF EXISTS notification_dismissed;

-- Drop the email notification trigger function
DROP FUNCTION IF EXISTS send_email_notification CASCADE;

-- Drop the email notification trigger
DROP TRIGGER IF EXISTS order_status_change_notification ON orders;

-- Remove the send-order-notification function from config
-- (This will be handled by removing the function files) 