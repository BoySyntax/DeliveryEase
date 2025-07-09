-- Add unique constraint to cart_items table
ALTER TABLE cart_items 
ADD CONSTRAINT cart_items_cart_id_product_id_key 
UNIQUE (cart_id, product_id);

-- Update the upsert policy to use the new constraint
DROP POLICY IF EXISTS "Customers can insert items to their own carts" ON cart_items;
DROP POLICY IF EXISTS "Customers can update items in their own carts" ON cart_items;

CREATE POLICY "Customers can upsert items to their own carts"
ON cart_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_id
    AND carts.customer_id = auth.uid()
  )
);

CREATE POLICY "Customers can update their own cart items"
ON cart_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_items.cart_id
    AND carts.customer_id = auth.uid()
  )
); 