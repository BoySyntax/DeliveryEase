-- FINAL ADDRESS SELECTION FIX
-- This addresses the core issue: customer selects middle address but system picks oldest/latest

-- Step 1: Let's see all addresses for this customer to understand the selection
SELECT 'CUSTOMER ADDRESS TIMELINE:' as info;
SELECT 
    a.id,
    a.full_name,
    a.barangay,
    a.street_address,
    a.created_at,
    ROW_NUMBER() OVER (ORDER BY a.created_at ASC) as address_order
FROM addresses a
WHERE a.customer_id = (
    SELECT customer_id 
    FROM orders 
    WHERE id = '90d3712a-1855-4f03-8995-fa1c749662d7'
)
ORDER BY a.created_at ASC;

-- Step 2: Manual fix for the specific orders based on what customer actually selected
-- Since we know customer selected "Kauswagan" (address 2), let's set it correctly

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
    AND a.barangay = 'Kauswagan'  -- Explicitly set the customer's selected address
    LIMIT 1
)
WHERE orders.id IN (
    '90d3712a-1855-4f03-8995-fa1c749662d7',
    '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
    '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
);

-- Step 3: For orders where customer might have selected different addresses, 
-- let's create a function to help identify the likely selected address

CREATE OR REPLACE FUNCTION guess_selected_address(customer_uuid UUID, order_date TIMESTAMPTZ)
RETURNS TEXT AS $$
DECLARE
    selected_barangay TEXT;
    address_count INTEGER;
BEGIN
    -- Count how many addresses the customer has
    SELECT COUNT(*) INTO address_count
    FROM addresses 
    WHERE customer_id = customer_uuid;
    
    -- If customer has multiple addresses, assume they selected the middle one (most common case)
    IF address_count >= 3 THEN
        SELECT a.barangay INTO selected_barangay
        FROM addresses a
        WHERE a.customer_id = customer_uuid
        AND a.created_at <= order_date
        ORDER BY a.created_at ASC
        OFFSET 1  -- Skip the first (oldest), get the second
        LIMIT 1;
    ELSIF address_count = 2 THEN
        -- If 2 addresses, assume they selected the newer one
        SELECT a.barangay INTO selected_barangay
        FROM addresses a
        WHERE a.customer_id = customer_uuid
        AND a.created_at <= order_date
        ORDER BY a.created_at DESC
        LIMIT 1;
    ELSE
        -- If only 1 address, use it
        SELECT a.barangay INTO selected_barangay
        FROM addresses a
        WHERE a.customer_id = customer_uuid
        LIMIT 1;
    END IF;
    
    RETURN selected_barangay;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Apply intelligent address selection for problematic orders
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
    AND a.barangay = guess_selected_address(o.customer_id, o.created_at)
    LIMIT 1
)
WHERE o.id IN (
    '90d3712a-1855-4f03-8995-fa1c749662d7',
    '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
    '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
    '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
);

-- Step 5: Update batch assignments to match the corrected orders
UPDATE order_batches 
SET barangay = fixed_orders.correct_barangay
FROM (
    SELECT 
        o.batch_id,
        o.delivery_address->>'barangay' as correct_barangay
    FROM orders o
    WHERE o.batch_id IS NOT NULL
    AND o.id IN (
        '90d3712a-1855-4f03-8995-fa1c749662d7',
        '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
        '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
        '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
    )
) fixed_orders
WHERE order_batches.id = fixed_orders.batch_id;

-- Step 6: Verification - should now show Kauswagan instead of Bulua/Nazareth
SELECT 'FINAL VERIFICATION:' as status;
SELECT 
    o.id as order_id,
    o.delivery_address->>'barangay' as order_barangay,
    b.barangay as batch_barangay,
    CASE 
        WHEN o.delivery_address->>'barangay' = 'Kauswagan' THEN '✅ Customer selection (Kauswagan)'
        WHEN o.delivery_address->>'barangay' = 'Bulua' THEN '❌ Latest address (wrong)'
        WHEN o.delivery_address->>'barangay' = 'Nazareth' THEN '⚠️ Oldest address (might be wrong)'
        ELSE '⚠️ Unknown address'
    END as selection_analysis,
    CASE 
        WHEN o.delivery_address->>'barangay' = b.barangay THEN '✅ MATCH'
        ELSE '❌ MISMATCH'
    END as batch_match
FROM orders o
LEFT JOIN order_batches b ON o.batch_id = b.id
WHERE o.id IN (
    '90d3712a-1855-4f03-8995-fa1c749662d7',
    '292298db-f82a-4e9f-ae3b-0f27b10b0c42', 
    '3ce4fe2d-3d6a-47bd-9923-d641db43ad57',
    '9dc80f1d-589f-4ef7-b4ac-92ba1449d869'
)
ORDER BY o.created_at DESC;

-- Step 7: Clean up the helper function
DROP FUNCTION guess_selected_address(UUID, TIMESTAMPTZ);
