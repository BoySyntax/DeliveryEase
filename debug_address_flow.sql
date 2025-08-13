-- COMPLETE DIAGNOSTIC FOR ADDRESS SELECTION ISSUE
-- This will help us trace the entire flow from customer addresses to batch creation

-- Step 1: Check customer addresses (what options are available)
SELECT 'CUSTOMER ADDRESSES AVAILABLE:' as step;
SELECT 
    a.id,
    a.full_name,
    a.barangay,
    a.street_address,
    a.created_at,
    a.customer_id
FROM addresses a
WHERE a.customer_id IN (
    SELECT DISTINCT customer_id 
    FROM orders 
    WHERE created_at > NOW() - INTERVAL '24 hours'
)
ORDER BY a.customer_id, a.created_at DESC;

-- Step 2: Check recent orders and their delivery addresses
SELECT 'RECENT ORDERS AND THEIR DELIVERY ADDRESSES:' as step;
SELECT 
    o.id as order_id,
    o.customer_id,
    o.created_at,
    o.approval_status,
    o.delivery_address->>'full_name' as delivery_full_name,
    o.delivery_address->>'barangay' as delivery_barangay,
    o.delivery_address->>'street_address' as delivery_street,
    o.batch_id,
    b.barangay as batch_barangay
FROM orders o
LEFT JOIN order_batches b ON o.batch_id = b.id
WHERE o.created_at > NOW() - INTERVAL '24 hours'
ORDER BY o.created_at DESC;

-- Step 3: Check if there's a mismatch between order address and batch address
SELECT 'MISMATCHED ORDERS (Order barangay != Batch barangay):' as step;
SELECT 
    o.id as order_id,
    o.delivery_address->>'barangay' as order_says,
    b.barangay as batch_says,
    'MISMATCH!' as issue
FROM orders o
LEFT JOIN order_batches b ON o.batch_id = b.id
WHERE o.delivery_address->>'barangay' != b.barangay
AND o.created_at > NOW() - INTERVAL '24 hours'
ORDER BY o.created_at DESC;

-- Step 4: Check the exact order creation vs address selection timing
SELECT 'ORDER CREATION TIMING vs ADDRESS CREATION:' as step;
SELECT 
    o.id as order_id,
    o.created_at as order_created,
    o.delivery_address->>'barangay' as stored_barangay,
    a.barangay as address_barangay,
    a.created_at as address_created,
    CASE 
        WHEN a.created_at <= o.created_at THEN '✅ Address existed before order'
        ELSE '❌ Address created AFTER order'
    END as timing_check
FROM orders o
JOIN addresses a ON a.customer_id = o.customer_id
WHERE o.created_at > NOW() - INTERVAL '24 hours'
ORDER BY o.created_at DESC, a.created_at DESC;

-- Step 5: Check what the latest address would be vs what's stored
SELECT 'LATEST ADDRESS vs STORED ADDRESS COMPARISON:' as step;
SELECT 
    o.id as order_id,
    o.delivery_address->>'barangay' as stored_in_order,
    (SELECT a.barangay 
     FROM addresses a 
     WHERE a.customer_id = o.customer_id 
     ORDER BY a.created_at DESC 
     LIMIT 1) as latest_customer_address,
    (SELECT a.barangay 
     FROM addresses a 
     WHERE a.customer_id = o.customer_id 
     AND a.created_at <= o.created_at
     ORDER BY a.created_at DESC 
     LIMIT 1) as address_at_order_time,
    CASE 
        WHEN o.delivery_address->>'barangay' = (SELECT a.barangay FROM addresses a WHERE a.customer_id = o.customer_id ORDER BY a.created_at DESC LIMIT 1) 
        THEN '❌ Using LATEST address (wrong!)'
        WHEN o.delivery_address->>'barangay' = (SELECT a.barangay FROM addresses a WHERE a.customer_id = o.customer_id AND a.created_at <= o.created_at ORDER BY a.created_at DESC LIMIT 1)
        THEN '✅ Using correct address at order time'
        ELSE '⚠️ Using unknown address'
    END as diagnosis
FROM orders o
WHERE o.created_at > NOW() - INTERVAL '24 hours'
ORDER BY o.created_at DESC;
