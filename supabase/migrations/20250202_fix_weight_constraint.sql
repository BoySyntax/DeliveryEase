-- Fix the weight constraint to allow 5000kg maximum capacity
-- This fixes the constraint violation error

-- Drop the existing constraint
ALTER TABLE order_batches DROP CONSTRAINT IF EXISTS order_batches_max_weight_3500;

-- Add new constraint with 5000kg maximum
ALTER TABLE order_batches ADD CONSTRAINT order_batches_max_weight_5000 
CHECK (max_weight <= 5000 AND max_weight >= 0);

-- Update any existing batches that might have the old constraint
UPDATE order_batches 
SET max_weight = 5000 
WHERE max_weight = 3500;

-- Verify the constraint is working
SELECT 'Constraint fixed - max_weight can now be up to 5000kg' as status;























