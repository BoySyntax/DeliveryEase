-- Fix foreign key relationship between orders and order_batches
-- This ensures Supabase recognizes the relationship properly

-- First, make sure the foreign key constraint exists
DO $$
BEGIN
    -- Check if the foreign key constraint already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_batch_id_fkey' 
        AND table_name = 'orders'
    ) THEN
        -- Add the foreign key constraint if it doesn't exist
        ALTER TABLE orders 
        ADD CONSTRAINT orders_batch_id_fkey 
        FOREIGN KEY (batch_id) REFERENCES order_batches(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Foreign key constraint orders_batch_id_fkey created successfully';
    ELSE
        RAISE NOTICE 'Foreign key constraint orders_batch_id_fkey already exists';
    END IF;
END $$;

-- Refresh Supabase schema cache
NOTIFY pgrst, 'reload schema';

-- Verify the relationship exists
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name = 'orders'
AND tc.constraint_name = 'orders_batch_id_fkey';

-- Success message
SELECT '✅ Foreign key relationship verified!' as status; 