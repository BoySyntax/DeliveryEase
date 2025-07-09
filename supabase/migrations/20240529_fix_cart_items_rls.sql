-- Drop existing policies for cart_items
DROP POLICY IF EXISTS "Customers can view items in their own carts" ON cart_items;
DROP POLICY IF EXISTS "Customers can insert items to their own carts" ON cart_items;
DROP POLICY IF EXISTS "Customers can update items in their own carts" ON cart_items;
DROP POLICY IF EXISTS "Customers can delete items from their own carts" ON cart_items;

-- Create new policies with proper joins and simpler conditions
CREATE POLICY "Customers can view items in their own carts"
ON cart_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_items.cart_id
    AND carts.customer_id = auth.uid()
  )
);

CREATE POLICY "Customers can insert items to their own carts"
ON cart_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_id
    AND carts.customer_id = auth.uid()
  )
);

CREATE POLICY "Customers can update items in their own carts"
ON cart_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_items.cart_id
    AND carts.customer_id = auth.uid()
  )
);

CREATE POLICY "Customers can delete items from their own carts"
ON cart_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_items.cart_id
    AND carts.customer_id = auth.uid()
  )
);

-- Enable RLS on cart_items table if not already enabled
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY; 