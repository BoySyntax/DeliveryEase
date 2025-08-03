-- Manual test: Insert a test notification
-- Replace 'YOUR_CUSTOMER_USER_ID' with an actual customer user ID from your auth.users table

-- First, get a customer user ID
SELECT id, email FROM auth.users WHERE role = 'customer' LIMIT 1;

-- Then insert a test notification (replace the user_id with the actual ID from above)
INSERT INTO notifications (user_id, title, message, type, data)
VALUES (
  'YOUR_CUSTOMER_USER_ID', -- Replace with actual user ID
  'Test Notification',
  'This is a test notification to verify the system is working.',
  'info',
  '{"test": true}'::jsonb
);

-- Check if the notification was created
SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5; 