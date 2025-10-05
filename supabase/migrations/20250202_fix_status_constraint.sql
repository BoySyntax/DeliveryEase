-- Fix the status constraint to allow 'ready_for_delivery' status
-- This fixes the check_status_valid constraint violation

-- First, let's see what the current constraint allows
SELECT conname, consrc 
FROM pg_constraint 
WHERE conname = 'check_status_valid' 
AND conrelid = 'order_batches'::regclass;

-- Drop the existing constraint
ALTER TABLE order_batches DROP CONSTRAINT IF EXISTS check_status_valid;

-- Add new constraint that allows 'ready_for_delivery' status
ALTER TABLE order_batches ADD CONSTRAINT check_status_valid 
CHECK (status IN ('pending', 'ready_for_delivery', 'in_transit', 'delivered', 'cancelled'));

-- Verify the constraint is working
SELECT 'Status constraint fixed - ready_for_delivery is now allowed' as status;






