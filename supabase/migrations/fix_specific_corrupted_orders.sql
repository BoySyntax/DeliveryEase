-- FIX SPECIFIC CORRUPTED ORDERS
-- Target the exact orders that are still showing wrong addresses

-- Step 1: Show current state of problematic orders
SELECT 'CURRENT STATE OF PROBLEMATIC ORDERS:' as status;
SELECT 
    o.id as order_id,
    o.delivery_address->>'barangay' as current_order_barangay,
    o.delivery_address->>'full_name' as current_name,
    b.barangay as current_batch_barangay,
    o.created_at
FROM orders o
LEFT JOIN order_batches b ON o.batch_id = b.id
WHERE o.id IN (
    '90d3712a-1855-4f03-8995-fa1c749662d7',
    '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
    '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
    '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
)
ORDER BY o.created_at DESC;

-- Step 2: Show all available addresses for the customer to choose the correct one
SELECT 'CUSTOMER ADDRESSES AVAILABLE:' as info;
SELECT 
    a.id as address_id,
    a.full_name,
    a.barangay,
    a.street_address,
    a.created_at,
    ROW_NUMBER() OVER (ORDER BY a.created_at ASC) as address_number
FROM addresses a
WHERE a.customer_id = (
    SELECT DISTINCT customer_id 
    FROM orders 
    WHERE id IN (
        '90d3712a-1855-4f03-8995-fa1c749662d7',
        '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
        '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
        '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
    )
)
ORDER BY a.created_at ASC;

-- Step 3: MANUAL FIX - Set all problematic orders to use Kauswagan address
-- Since you mentioned you selected the 2nd address (Kauswagan)

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
    AND a.barangay = 'Kauswagan'  -- Force to Kauswagan (the 2nd address you selected)
    LIMIT 1
)
WHERE orders.id IN (
    '90d3712a-1855-4f03-8995-fa1c749662d7',
    '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
    '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
    '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
);

-- Step 4: Fix the batch assignments to match
UPDATE order_batches 
SET barangay = 'Kauswagan'
WHERE id IN (
    SELECT DISTINCT o.batch_id
    FROM orders o
    WHERE o.id IN (
        '90d3712a-1855-4f03-8995-fa1c749662d7',
        '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
        '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
        '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
    )
    AND o.batch_id IS NOT NULL
);

-- Step 5: Alternative fix - if Kauswagan doesn't exist, use the 2nd address chronologically
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
    FROM (
        SELECT a.*, ROW_NUMBER() OVER (ORDER BY a.created_at ASC) as rn
        FROM addresses a
        WHERE a.customer_id = o.customer_id
    ) a
    WHERE a.rn = 2  -- Get the 2nd address (index 2)
    LIMIT 1
)
WHERE o.id IN (
    '90d3712a-1855-4f03-8995-fa1c749662d7',
    '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
    '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
    '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
)
AND o.delivery_address->>'barangay' != 'Kauswagan';  -- Only if Kauswagan fix didn't work

-- Step 6: Update batch assignments again if needed
UPDATE order_batches 
SET barangay = (
    SELECT o.delivery_address->>'barangay'
    FROM orders o
    WHERE o.batch_id = order_batches.id
    LIMIT 1
)
WHERE id IN (
    SELECT DISTINCT o.batch_id
    FROM orders o
    WHERE o.id IN (
        '90d3712a-1855-4f03-8995-fa1c749662d7',
        '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
        '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
        '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
    )
    AND o.batch_id IS NOT NULL
);

-- Step 7: FINAL VERIFICATION
SELECT 'FINAL VERIFICATION - Orders should now be fixed:' as status;
SELECT 
    o.id as order_id,
    SUBSTRING(o.id::text, 1, 8) as short_id,
    o.delivery_address->>'barangay' as order_barangay,
    o.delivery_address->>'full_name' as order_name,
    b.barangay as batch_barangay,
    CASE 
        WHEN o.delivery_address->>'barangay' = b.barangay THEN '✅ ORDER & BATCH MATCH'
        ELSE '❌ MISMATCH - ' || COALESCE(o.delivery_address->>'barangay', 'NULL') || ' vs ' || COALESCE(b.barangay, 'NULL')
    END as match_status,
    CASE 
        WHEN o.delivery_address->>'barangay' = 'Kauswagan' THEN '✅ KAUSWAGAN (CORRECT)'
        WHEN o.delivery_address->>'barangay' = 'Bulua' THEN '❌ BULUA (WRONG - LATEST)'
        WHEN o.delivery_address->>'barangay' = 'Nazareth' THEN '⚠️ NAZARETH (WRONG - OLDEST)'
        ELSE '⚠️ OTHER: ' || COALESCE(o.delivery_address->>'barangay', 'NULL')
    END as address_analysis
FROM orders o
LEFT JOIN order_batches b ON o.batch_id = b.id
WHERE o.id IN (
    '90d3712a-1855-4f03-8995-fa1c749662d7',
    '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
    '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
    '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
)
ORDER BY o.created_at DESC;
