-- Fix RLS policies for order_batches to allow drivers to view their assigned batches
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Allow authenticated users to view order_batches" ON order_batches;

-- Create new policy that allows drivers to view their assigned batches
CREATE POLICY "Drivers can view their assigned batches"
  ON order_batches FOR SELECT
  TO authenticated
  USING (
    driver_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Also add a policy for drivers to update their assigned batches
CREATE POLICY "Drivers can update their assigned batches"
  ON order_batches FOR UPDATE
  TO authenticated
  USING (
    driver_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Verify the policies are created
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'order_batches'
AND policyname LIKE '%driver%'; 