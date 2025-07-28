-- Fix driver access to order_items
-- The issue is that orders assigned to batches don't have driver_id set,
-- which prevents drivers from accessing order_items due to RLS policies

-- First, let's update orders to set driver_id when they're assigned to a batch with a driver
UPDATE orders 
SET driver_id = ob.driver_id
FROM order_batches ob
WHERE orders.batch_id = ob.id 
  AND ob.driver_id IS NOT NULL 
  AND orders.driver_id IS NULL;

-- Update the RLS policy for order_items to also allow access through batch assignment
DROP POLICY IF EXISTS "Users can view items in their allowed orders" ON order_items;

CREATE POLICY "Users can view items in their allowed orders"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_id AND (
        orders.customer_id = auth.uid() OR
        orders.driver_id = auth.uid() OR
        -- Allow access if order is in a batch assigned to the current driver
        EXISTS (
          SELECT 1 FROM order_batches ob
          WHERE ob.id = orders.batch_id 
            AND ob.driver_id = auth.uid()
        ) OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      )
    )
  );

-- Also update the orders RLS policy to allow drivers to view orders in their batches
DROP POLICY IF EXISTS "Drivers can view orders assigned to them" ON orders;

CREATE POLICY "Drivers can view orders assigned to them"
  ON orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = driver_id OR
    -- Allow access if order is in a batch assigned to the current driver
    EXISTS (
      SELECT 1 FROM order_batches ob
      WHERE ob.id = batch_id 
        AND ob.driver_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ); 