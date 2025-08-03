-- Improved Notification Trigger
-- Run this in your Supabase SQL Editor

-- Drop the old trigger and function
DROP TRIGGER IF EXISTS trigger_update_notification_on_status_change ON orders;
DROP FUNCTION IF EXISTS update_notification_on_status_change();

-- Create an improved trigger function
CREATE OR REPLACE FUNCTION update_notification_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Always update notification based on current status
  IF NEW.approval_status = 'rejected' THEN
    NEW.notification_status = 'rejected';
    NEW.notification_message = 'Your payment has been rejected. Please contact support for more information.';
    NEW.notification_created_at = NOW();
  ELSIF NEW.approval_status = 'approved' THEN
    NEW.notification_status = 'verified';
    NEW.notification_message = 'Your order has been verified and is being prepared for delivery.';
    NEW.notification_created_at = NOW();
  ELSIF NEW.approval_status = 'pending' AND OLD.approval_status IS NULL THEN
    -- Only set 'placed' status when order is first created
    NEW.notification_status = 'placed';
    NEW.notification_message = 'Your order has been successfully placed and is pending approval.';
    NEW.notification_created_at = NEW.created_at;
  END IF;

  -- Update notification when delivery_status changes
  IF NEW.delivery_status = 'delivering' THEN
    NEW.notification_status = 'delivering';
    NEW.notification_message = 'Your order is now out for delivery. Estimated delivery: ' || 
      (CURRENT_DATE + INTERVAL '1 day')::text;
    NEW.notification_created_at = NOW();
  ELSIF NEW.delivery_status = 'delivered' THEN
    NEW.notification_status = 'delivered';
    NEW.notification_message = 'Your order has been successfully delivered. Thank you for choosing DeliveryEase!';
    NEW.notification_created_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the improved trigger
CREATE TRIGGER trigger_update_notification_on_status_change
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_on_status_change();

-- Also create a trigger for INSERT to set initial notification status
CREATE OR REPLACE FUNCTION set_initial_notification_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Set initial notification status for new orders
  NEW.notification_status = 'placed';
  NEW.notification_message = 'Your order has been successfully placed and is pending approval.';
  NEW.notification_created_at = NEW.created_at;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the INSERT trigger
DROP TRIGGER IF EXISTS trigger_set_initial_notification_status ON orders;
CREATE TRIGGER trigger_set_initial_notification_status
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_initial_notification_status();

-- Verify the triggers were created
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE trigger_name IN (
  'trigger_update_notification_on_status_change',
  'trigger_set_initial_notification_status'
); 