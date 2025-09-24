-- Fix admin permissions for vehicle table
-- Add missing UPDATE and INSERT policies for admins

-- Add policy for admins to update all vehicles
CREATE POLICY "Admins can update all vehicles" ON vehicles
    FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Add policy for admins to insert vehicles for any driver
CREATE POLICY "Admins can insert vehicles for any driver" ON vehicles
    FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Add policy for admins to delete any vehicle (optional but good to have)
CREATE POLICY "Admins can delete any vehicle" ON vehicles
    FOR DELETE 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );
