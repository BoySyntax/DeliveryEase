-- Fix Real-time Notifications
-- Run this in your Supabase SQL Editor

-- Create a trigger function to automatically update notifications when order status changes
CREATE OR REPLACE FUNCTION update_notification_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update notification when approval_status changes
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    IF NEW.approval_status = 'approved' THEN
      NEW.notification_status = 'verified';
      NEW.notification_message = 'Your order has been verified and is being prepared for delivery.';
      NEW.notification_created_at = NOW();
    ELSIF NEW.approval_status = 'rejected' THEN
      NEW.notification_status = 'rejected';
      NEW.notification_message = 'Your payment has been rejected. Please contact support for more information.';
      NEW.notification_created_at = NOW();
    END IF;
  END IF;

  -- Update notification when delivery_status changes
  IF OLD.delivery_status IS DISTINCT FROM NEW.delivery_status THEN
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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_notification_on_status_change ON orders;
CREATE TRIGGER trigger_update_notification_on_status_change
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_on_status_change();

-- Update existing orders to have proper notification status based on their current status
UPDATE orders 
SET 
  notification_status = CASE 
    WHEN approval_status = 'approved' THEN 'verified'
    WHEN approval_status = 'rejected' THEN 'rejected'
    WHEN delivery_status = 'delivering' THEN 'delivering'
    WHEN delivery_status = 'delivered' THEN 'delivered'
    WHEN approval_status = 'pending' THEN 'placed'
    ELSE 'none'
  END,
  notification_message = CASE 
    WHEN approval_status = 'approved' THEN 'Your order has been verified and is being prepared for delivery.'
    WHEN approval_status = 'rejected' THEN 'Your payment has been rejected. Please contact support for more information.'
    WHEN delivery_status = 'delivering' THEN 'Your order is now out for delivery. Estimated delivery: ' || (CURRENT_DATE + INTERVAL '1 day')::text
    WHEN delivery_status = 'delivered' THEN 'Your order has been successfully delivered. Thank you for choosing DeliveryEase!'
    WHEN approval_status = 'pending' THEN 'Your order has been successfully placed and is pending approval.'
    ELSE NULL
  END,
  notification_created_at = CASE 
    WHEN approval_status != 'pending' OR delivery_status IN ('delivering', 'delivered') THEN NOW()
    ELSE created_at
  END
WHERE notification_status = 'none' OR notification_status IS NULL;

-- Verify the trigger was created
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_update_notification_on_status_change'; 