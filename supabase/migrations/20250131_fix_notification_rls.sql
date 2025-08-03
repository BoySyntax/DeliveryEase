-- Fix RLS policies for notifications
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can insert their own notifications" ON notifications;

-- Create new policies that work with SECURITY DEFINER functions
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow system functions to insert notifications
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- Alternative: Create a more permissive policy for testing
-- CREATE POLICY "Allow all operations for testing" ON notifications
--   FOR ALL USING (true) WITH CHECK (true); 