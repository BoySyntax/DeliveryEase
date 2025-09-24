-- SIMPLE FIX FOR ADDRESS SELECTION ISSUE
-- This only uses columns that definitely exist in the addresses table

-- Step 1: Show current problematic orders
SELECT 'BEFORE FIX - Orders with potential address issues:' as status;
SELECT 
    o.id as order_id,
    o.customer_id,
    o.delivery_address->>'barangay' as current_order_barangay,
    b.barangay as current_batch_barangay,
    (SELECT a.barangay 
     FROM addresses a 
     WHERE a.customer_id = o.customer_id 
     AND a.created_at <= o.created_at 
     ORDER BY a.created_at DESC 
     LIMIT 1) as should_be_barangay,
    o.created_at
FROM orders o
LEFT JOIN order_batches b ON o.batch_id = b.id
WHERE o.delivery_address IS NOT NULL
ORDER BY o.created_at DESC
LIMIT 10;

-- Step 2: Fix delivery addresses in orders table (using ONLY columns that exist)
UPDATE orders o
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
  WHERE a.customer_id = o.customer_id
  AND a.created_at <= o.created_at
  ORDER BY a.created_at DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 
  FROM addresses a 
  WHERE a.customer_id = o.customer_id 
  AND a.created_at <= o.created_at
  AND a.barangay != COALESCE(o.delivery_address->>'barangay', '')
  ORDER BY a.created_at DESC 
  LIMIT 1
);

-- Step 3: Fix batch barangays to match the corrected order addresses
UPDATE order_batches 
SET barangay = subquery.correct_barangay
FROM (
    SELECT DISTINCT 
        o.batch_id,
        o.delivery_address->>'barangay' as correct_barangay
    FROM orders o
    WHERE o.batch_id IS NOT NULL
    AND o.delivery_address IS NOT NULL
) subquery
WHERE order_batches.id = subquery.batch_id
AND order_batches.barangay != subquery.correct_barangay;

-- Step 4: Handle any orders that might not have delivery_address but are in batches
UPDATE orders o
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
  WHERE a.customer_id = o.customer_id
  AND a.created_at <= o.created_at
  ORDER BY a.created_at DESC
  LIMIT 1
)
WHERE o.delivery_address IS NULL
AND EXISTS (
  SELECT 1 FROM addresses a 
  WHERE a.customer_id = o.customer_id 
  AND a.created_at <= o.created_at
);

-- Step 5: Show results after fix
SELECT 'AFTER FIX - Orders should now have correct addresses:' as status;
SELECT 
    o.id as order_id,
    o.customer_id,
    o.delivery_address->>'barangay' as fixed_order_barangay,
    b.barangay as fixed_batch_barangay,
    CASE 
        WHEN o.delivery_address->>'barangay' = b.barangay THEN '✅ MATCH'
        ELSE '❌ MISMATCH'
    END as status,
    o.created_at
FROM orders o
LEFT JOIN order_batches b ON o.batch_id = b.id
WHERE o.delivery_address IS NOT NULL
ORDER BY o.created_at DESC
LIMIT 10;

-- Step 6: Add protective comment to prevent future issues
COMMENT ON COLUMN orders.delivery_address IS 'Stores the delivery address selected during checkout. DO NOT overwrite with latest customer address - preserve customer choice!';

-- Step 7: Show summary of what was fixed
SELECT 'SUMMARY:' as info, 
       COUNT(*) as total_orders_with_addresses,
       COUNT(CASE WHEN delivery_address->>'barangay' IS NOT NULL THEN 1 END) as orders_with_barangay
FROM orders 
WHERE delivery_address IS NOT NULL;
