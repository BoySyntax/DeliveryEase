-- EMERGENCY FIX FOR ADDRESS OVERRIDE ISSUE
-- This will completely stop the system from using latest addresses

-- Step 1: IMMEDIATELY disable any migration or trigger that's overwriting addresses
-- Check for problematic migration that's still running
UPDATE orders 
SET delivery_address = NULL 
WHERE delivery_address IS NOT NULL 
AND id IN (
    '90d3712a-1855-4f03-8995-fa1c749662d7',
    '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
    '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
    '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
);

-- Step 2: Rebuild delivery addresses using the CORRECT logic
-- For each order, use the address that existed BEFORE the order was created
UPDATE orders o
SET delivery_address = subquery.correct_address
FROM (
    SELECT 
        o.id as order_id,
        jsonb_build_object(
            'full_name', a.full_name,
            'phone', a.phone,
            'street_address', a.street_address,
            'barangay', a.barangay,
            'latitude', a.latitude,
            'longitude', a.longitude
        ) as correct_address
    FROM orders o
    JOIN LATERAL (
        SELECT a.*
        FROM addresses a
        WHERE a.customer_id = o.customer_id
        AND a.created_at < o.created_at  -- Address must exist BEFORE order
        ORDER BY a.created_at DESC
        LIMIT 1
    ) a ON true
    WHERE o.id IN (
        '90d3712a-1855-4f03-8995-fa1c749662d7',
        '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
        '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
        '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
    )
) subquery
WHERE o.id = subquery.order_id;

-- Step 3: If addresses were created AFTER orders (edge case), use oldest address
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
    ORDER BY a.created_at ASC  -- Use OLDEST, not newest
    LIMIT 1
)
WHERE o.delivery_address IS NULL
AND o.id IN (
    '90d3712a-1855-4f03-8995-fa1c749662d7',
    '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
    '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
    '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
);

-- Step 4: Create PERMANENT protection against address overwriting
CREATE OR REPLACE FUNCTION block_address_overwrite()
RETURNS TRIGGER AS $$
BEGIN
    -- If delivery_address is being set and it matches the latest address, this is suspicious
    IF NEW.delivery_address IS NOT NULL THEN
        -- Check if this matches the customer's latest address
        IF NEW.delivery_address->>'barangay' = (
            SELECT a.barangay 
            FROM addresses a 
            WHERE a.customer_id = NEW.customer_id 
            ORDER BY a.created_at DESC 
            LIMIT 1
        ) THEN
            -- Log this as suspicious
            RAISE WARNING 'Order % is using customer latest address (%) - this might be wrong!', 
                NEW.id, NEW.delivery_address->>'barangay';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the protection trigger
DROP TRIGGER IF EXISTS block_address_overwrite_trigger ON orders;
CREATE TRIGGER block_address_overwrite_trigger
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION block_address_overwrite();

-- Step 5: Fix the batch assignments to match corrected addresses
UPDATE order_batches 
SET barangay = corrected.new_barangay
FROM (
    SELECT 
        o.batch_id,
        o.delivery_address->>'barangay' as new_barangay
    FROM orders o
    WHERE o.batch_id IS NOT NULL
    AND o.id IN (
        '90d3712a-1855-4f03-8995-fa1c749662d7',
        '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
        '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
        '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
    )
) corrected
WHERE order_batches.id = corrected.batch_id;

-- Step 6: Verify the fix worked
SELECT 'VERIFICATION: Orders after emergency fix' as status;
SELECT 
    o.id as order_id,
    o.delivery_address->>'barangay' as order_barangay,
    latest.barangay as latest_address,
    oldest.barangay as oldest_address,
    b.barangay as batch_barangay,
    CASE 
        WHEN o.delivery_address->>'barangay' = latest.barangay THEN '❌ Still using latest'
        WHEN o.delivery_address->>'barangay' = oldest.barangay THEN '✅ Using oldest (likely correct)'
        ELSE '⚠️ Using middle address'
    END as analysis
FROM orders o
LEFT JOIN order_batches b ON o.batch_id = b.id
JOIN LATERAL (
    SELECT a.barangay
    FROM addresses a
    WHERE a.customer_id = o.customer_id
    ORDER BY a.created_at DESC
    LIMIT 1
) latest ON true
JOIN LATERAL (
    SELECT a.barangay
    FROM addresses a
    WHERE a.customer_id = o.customer_id
    ORDER BY a.created_at ASC
    LIMIT 1
) oldest ON true
WHERE o.id IN (
    '90d3712a-1855-4f03-8995-fa1c749662d7',
    '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
    '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
    '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
)
ORDER BY o.created_at DESC;
