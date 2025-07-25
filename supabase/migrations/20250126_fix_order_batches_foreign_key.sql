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