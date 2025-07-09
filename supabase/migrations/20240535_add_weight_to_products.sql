-- Add weight column to products table
ALTER TABLE products ADD COLUMN weight DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Add comment to explain the weight unit
COMMENT ON COLUMN products.weight IS 'Product weight in kilograms';

-- Update RLS policies to include the new column
DROP POLICY IF EXISTS "Only admins can update products" ON products;
CREATE POLICY "Only admins can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )); 