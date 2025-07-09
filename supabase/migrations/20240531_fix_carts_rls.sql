-- Drop existing policies
DROP POLICY IF EXISTS "Customers can view their own carts" ON carts;
DROP POLICY IF EXISTS "Customers can insert their own carts" ON carts;
DROP POLICY IF EXISTS "Customers can update their own carts" ON carts;
DROP POLICY IF EXISTS "Customers can delete their own carts" ON carts;

-- Create new simplified policies
CREATE POLICY "Enable read access for authenticated users"
ON carts FOR SELECT
TO authenticated
USING (auth.uid() = customer_id);

CREATE POLICY "Enable insert access for authenticated users"
ON carts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Enable update access for authenticated users"
ON carts FOR UPDATE
TO authenticated
USING (auth.uid() = customer_id);

CREATE POLICY "Enable delete access for authenticated users"
ON carts FOR DELETE
TO authenticated
USING (auth.uid() = customer_id);

-- Make sure RLS is enabled
ALTER TABLE carts ENABLE ROW LEVEL SECURITY; 