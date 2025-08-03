-- Add Read Status Field for Notifications
-- Run this in your Supabase SQL Editor

-- Add a separate read_status field to track read/unread state
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS notification_read BOOLEAN DEFAULT FALSE;

-- Update existing notifications to be unread
UPDATE orders 
SET notification_read = FALSE 
WHERE notification_status != 'none' 
AND notification_read IS NULL;

-- Create a function to mark a notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_order_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE orders 
  SET notification_read = TRUE
  WHERE id = p_order_id 
  AND customer_id = auth.uid();
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to get unread notifications count
CREATE OR REPLACE FUNCTION get_unread_notifications_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) 
    FROM orders 
    WHERE customer_id = auth.uid() 
    AND notification_status != 'none'
    AND notification_read = FALSE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to mark all notifications as read
CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE orders 
  SET notification_read = TRUE
  WHERE customer_id = auth.uid() 
  AND notification_status != 'none'
  AND notification_read = FALSE;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION mark_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_notifications_count() TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read() TO authenticated;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_orders_notification_read ON orders(customer_id, notification_read) 
WHERE notification_status != 'none';

-- Verify the setup
SELECT 'Read status field added successfully!' as status; 