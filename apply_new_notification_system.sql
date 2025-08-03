-- Apply New Notification System
-- Run this in your Supabase SQL Editor

-- Step 1: Drop old notifications table and functions
DROP FUNCTION IF EXISTS create_notification(text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS mark_notification_read(uuid);
DROP FUNCTION IF EXISTS mark_all_notifications_read();
DROP FUNCTION IF EXISTS get_unread_notification_count();

-- Drop the notifications table
DROP TABLE IF EXISTS notifications CASCADE;

-- Drop any related policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

-- Clean up any remaining references
DROP INDEX IF EXISTS idx_notifications_user_id;
DROP INDEX IF EXISTS idx_notifications_read;
DROP INDEX IF EXISTS idx_notifications_created_at;

-- Step 2: Add notification fields to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS notification_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS notification_message TEXT,
ADD COLUMN IF NOT EXISTS notification_created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Step 3: Create indexes for notification queries
CREATE INDEX IF NOT EXISTS idx_orders_notification_status ON orders(notification_status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_notifications ON orders(customer_id, notification_status);

-- Step 4: Create function to update notification status
CREATE OR REPLACE FUNCTION update_order_notification(
  p_order_id UUID,
  p_status TEXT,
  p_message TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE orders 
  SET 
    notification_status = p_status,
    notification_message = p_message,
    notification_created_at = NOW()
  WHERE id = p_order_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create function to get unread notifications count
CREATE OR REPLACE FUNCTION get_unread_notifications_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) 
    FROM orders 
    WHERE customer_id = auth.uid() 
    AND notification_status != 'none'
    AND notification_status != 'read'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create function to mark notifications as read
CREATE OR REPLACE FUNCTION mark_notifications_read()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE orders 
  SET notification_status = 'read'
  WHERE customer_id = auth.uid() 
  AND notification_status != 'none'
  AND notification_status != 'read';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Grant permissions
GRANT EXECUTE ON FUNCTION update_order_notification(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_notifications_count() TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notifications_read() TO authenticated;

-- Step 8: Verify the setup
SELECT 'New notification system applied successfully!' as status; 