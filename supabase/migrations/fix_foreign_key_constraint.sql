-- Fix foreign key relationship between orders and order_batches
-- First, drop the constraint if it exists to avoid errors
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_batch_id_fkey' 
        AND table_name = 'orders'
    ) THEN
        ALTER TABLE orders DROP CONSTRAINT orders_batch_id_fkey;
    END IF;
END $$;

-- Add the foreign key constraint
ALTER TABLE orders 
ADD CONSTRAINT orders_batch_id_fkey 
FOREIGN KEY (batch_id) REFERENCES order_batches(id) ON DELETE SET NULL;

-- Verify the constraint was added
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
AND tc.table_name='orders' 
AND kcu.column_name='batch_id'; 