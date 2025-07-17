-- Fix the delivery_status check constraint to allow the correct values
-- The current constraint only allows ('pending', 'in_progress', 'delivered')
-- But we need ('pending', 'assigned', 'delivering', 'delivered')

-- Drop the existing constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;

-- Add the correct constraint with all the values we need
ALTER TABLE orders 
ADD CONSTRAINT orders_delivery_status_check 
    CHECK (delivery_status IN ('pending', 'assigned', 'delivering', 'delivered'));

-- Update any existing 'in_progress' values to 'delivering' to match our new constraint
UPDATE orders 
SET delivery_status = 'delivering' 
WHERE delivery_status = 'in_progress';

-- Now run the batch assignment fix
-- Update existing orders that are in assigned batches but still have pending delivery_status
UPDATE orders 
SET delivery_status = 'assigned'
WHERE batch_id IN (
    SELECT id FROM order_batches 
    WHERE status = 'assigned' AND driver_id IS NOT NULL
) 
AND delivery_status = 'pending';

-- Update existing orders that are in delivering batches
UPDATE orders 
SET delivery_status = 'delivering'
WHERE batch_id IN (
    SELECT id FROM order_batches 
    WHERE status = 'delivering'
) 
AND delivery_status IN ('pending', 'assigned');

-- Update existing orders that are in delivered batches
UPDATE orders 
SET delivery_status = 'delivered'
WHERE batch_id IN (
    SELECT id FROM order_batches 
    WHERE status = 'delivered'
) 
AND delivery_status != 'delivered'; 