-- Fix order_batches foreign key constraint
-- Add foreign key constraint for driver_id to reference profiles table

-- First, drop any existing incorrect foreign key if it exists
ALTER TABLE order_batches 
DROP CONSTRAINT IF EXISTS order_batches_driver_id_fkey;

-- Add the correct foreign key constraint
ALTER TABLE order_batches 
ADD CONSTRAINT order_batches_driver_id_fkey 
FOREIGN KEY (driver_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- Update RLS policies to ensure proper access
DROP POLICY IF EXISTS "Allow drivers to view their assigned batches" ON order_batches;

CREATE POLICY "Allow drivers to view their assigned batches"
ON order_batches
FOR SELECT
TO authenticated
USING (
    driver_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Update the existing policy to be more specific
DROP POLICY IF EXISTS "Allow authenticated users to view order_batches" ON order_batches;

CREATE POLICY "Allow authenticated users to view order_batches"
ON order_batches
FOR SELECT
TO authenticated
USING (
    driver_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Add policy for drivers to update their assigned batches
CREATE POLICY "Allow drivers to update their assigned batches"
ON order_batches
FOR UPDATE
TO authenticated
USING (driver_id = auth.uid())
WITH CHECK (driver_id = auth.uid());

-- Verify the table structure
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name='order_batches'; 