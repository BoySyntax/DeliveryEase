-- Fix RLS policy to allow drivers to update orders in batches assigned to them
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Drivers can update assigned orders" ON orders;

-- Create new policy that allows drivers to update orders in their assigned batches
CREATE POLICY "Drivers can update orders in their batches"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_batches
      WHERE order_batches.id = orders.batch_id
      AND order_batches.driver_id = auth.uid()
    )
  );

-- Also add a policy for drivers to view orders in their batches
DROP POLICY IF EXISTS "Drivers can view assigned orders" ON orders;

CREATE POLICY "Drivers can view orders in their batches"
  ON orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM order_batches
      WHERE order_batches.id = orders.batch_id
      AND order_batches.driver_id = auth.uid()
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
WHERE tablename = 'orders' 
AND policyname LIKE '%driver%'; 