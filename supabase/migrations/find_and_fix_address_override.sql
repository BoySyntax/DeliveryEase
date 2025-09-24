-- FIND AND FIX THE ADDRESS OVERRIDE ISSUE
-- This will identify where the delivery_address is being changed from selected to latest

-- Step 1: First, let's see the current state
SELECT 'STEP 1: Current orders with their delivery addresses' as info;
SELECT 
    o.id,
    o.customer_id,
    o.created_at,
    o.approval_status,
    o.delivery_address->>'barangay' as stored_barangay,
    o.delivery_address->>'full_name' as stored_name,
    b.barangay as batch_barangay
FROM orders o
LEFT JOIN order_batches b ON o.batch_id = b.id
WHERE o.created_at > NOW() - INTERVAL '24 hours'
ORDER BY o.created_at DESC;

-- Step 2: Compare with what the latest address would be
SELECT 'STEP 2: Orders vs Latest Address (this shows the problem)' as info;
SELECT 
    o.id as order_id,
    o.delivery_address->>'barangay' as order_barangay,
    o.delivery_address->>'full_name' as order_name,
    latest.barangay as latest_barangay,
    latest.full_name as latest_name,
    CASE 
        WHEN o.delivery_address->>'barangay' = latest.barangay THEN '❌ USING LATEST (WRONG!)'
        ELSE '✅ Using selected address (correct)'
    END as analysis
FROM orders o
JOIN LATERAL (
    SELECT a.barangay, a.full_name
    FROM addresses a
    WHERE a.customer_id = o.customer_id
    ORDER BY a.created_at DESC
    LIMIT 1
) latest ON true
WHERE o.created_at > NOW() - INTERVAL '24 hours'
ORDER BY o.created_at DESC;

-- Step 3: Check if there are any triggers or functions that might be overwriting addresses
SELECT 'STEP 3: Functions that might be affecting delivery_address' as info;
SELECT 
    proname as function_name,
    prosrc as function_source
FROM pg_proc 
WHERE prosrc LIKE '%delivery_address%' 
   OR prosrc LIKE '%addresses%'
   OR proname LIKE '%batch%'
   OR proname LIKE '%address%';

-- Step 4: Let's see what triggers exist on the orders table
SELECT 'STEP 4: Triggers on orders table' as info;
SELECT 
    tgname as trigger_name,
    tgtype as trigger_type,
    tgenabled as enabled,
    pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger 
WHERE tgrelid = 'orders'::regclass;

-- Step 5: FIX - Disable any problematic migration or update that's overwriting addresses
-- First, let's create a function to preserve delivery addresses

CREATE OR REPLACE FUNCTION preserve_delivery_address()
RETURNS TRIGGER AS $$
BEGIN
    -- If delivery_address is already set, don't overwrite it!
    IF OLD.delivery_address IS NOT NULL AND NEW.delivery_address IS NULL THEN
        NEW.delivery_address := OLD.delivery_address;
        RAISE NOTICE 'Preserved delivery_address for order %', NEW.id;
    END IF;
    
    -- If someone tries to overwrite with the latest address, prevent it
    IF OLD.delivery_address IS NOT NULL AND NEW.delivery_address IS NOT NULL THEN
        IF OLD.delivery_address->>'barangay' != NEW.delivery_address->>'barangay' THEN
            RAISE NOTICE 'WARNING: Attempt to change delivery_address for order % from % to %', 
                NEW.id, 
                OLD.delivery_address->>'barangay', 
                NEW.delivery_address->>'barangay';
            -- Keep the original address
            NEW.delivery_address := OLD.delivery_address;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to preserve delivery addresses
DROP TRIGGER IF EXISTS preserve_delivery_address_trigger ON orders;
CREATE TRIGGER preserve_delivery_address_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION preserve_delivery_address();

-- Step 6: Clean up any recent orders that might have been corrupted
UPDATE orders 
SET delivery_address = (
    SELECT jsonb_build_object(
        'full_name', a.full_name,
        'phone', a.phone,
        'street_address', a.street_address,
        'barangay', a.barangay,
        'latitude', a.latitude,
        'longitude', a.longitude
    )
    FROM addresses a
    WHERE a.customer_id = orders.customer_id
    AND a.created_at <= orders.created_at
    ORDER BY a.created_at DESC
    LIMIT 1
)
WHERE orders.created_at > NOW() - INTERVAL '24 hours'
AND orders.delivery_address IS NOT NULL
AND orders.delivery_address->>'barangay' = (
    SELECT a.barangay 
    FROM addresses a 
    WHERE a.customer_id = orders.customer_id 
    ORDER BY a.created_at DESC 
    LIMIT 1
);

-- Step 7: Show the results
SELECT 'STEP 7: After fix - Orders should now be correct' as info;
SELECT 
    o.id as order_id,
    o.delivery_address->>'barangay' as order_barangay,
    latest.barangay as latest_barangay,
    CASE 
        WHEN o.delivery_address->>'barangay' = latest.barangay THEN '❌ Still using latest'
        ELSE '✅ Now using correct address'
    END as status
FROM orders o
JOIN LATERAL (
    SELECT a.barangay
    FROM addresses a
    WHERE a.customer_id = o.customer_id
    ORDER BY a.created_at DESC
    LIMIT 1
) latest ON true
WHERE o.created_at > NOW() - INTERVAL '24 hours'
ORDER BY o.created_at DESC;
