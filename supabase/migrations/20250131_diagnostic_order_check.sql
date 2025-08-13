-- Diagnostic script to check order delivery addresses
-- This will help us see what's happening with the order batching

-- Function to check specific order details
CREATE OR REPLACE FUNCTION check_order_details(order_id_input TEXT DEFAULT NULL)
RETURNS TABLE(
    order_id UUID,
    customer_id UUID,
    order_created_at TIMESTAMP WITH TIME ZONE,
    delivery_address_barangay TEXT,
    full_delivery_address JSONB,
    batch_id UUID,
    batch_barangay TEXT,
    customer_addresses_count INTEGER,
    customer_latest_address_barangay TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id as order_id,
        o.customer_id,
        o.created_at as order_created_at,
        o.delivery_address->>'barangay' as delivery_address_barangay,
        o.delivery_address as full_delivery_address,
        o.batch_id,
        b.barangay as batch_barangay,
        (SELECT COUNT(*) FROM addresses a WHERE a.customer_id = o.customer_id)::INTEGER as customer_addresses_count,
        (SELECT a.barangay FROM addresses a WHERE a.customer_id = o.customer_id ORDER BY a.created_at DESC LIMIT 1) as customer_latest_address_barangay
    FROM orders o
    LEFT JOIN order_batches b ON o.batch_id = b.id
    WHERE (order_id_input IS NULL OR o.id::TEXT LIKE '%' || order_id_input || '%')
    ORDER BY o.created_at DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Check all recent orders
SELECT 'All Recent Orders:' as info;
SELECT * FROM check_order_details();

-- Check if there are any orders with mismatched barangays
SELECT 'Orders with Mismatched Barangays:' as info;
SELECT 
    order_id,
    delivery_address_barangay as "Order Says",
    batch_barangay as "Batch Says",
    customer_latest_address_barangay as "Customer Latest"
FROM check_order_details()
WHERE delivery_address_barangay != batch_barangay;

-- Show customer addresses for debugging
SELECT 'Customer Addresses (recent first):' as info;
SELECT 
    a.id,
    a.customer_id,
    a.full_name,
    a.barangay,
    a.created_at,
    p.name as customer_name
FROM addresses a
JOIN profiles p ON a.customer_id = p.id
ORDER BY a.created_at DESC
LIMIT 10;

-- Clean up the function
DROP FUNCTION check_order_details(TEXT);
