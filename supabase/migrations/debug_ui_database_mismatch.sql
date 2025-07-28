-- Debug script to identify UI vs Database weight mismatch
-- This will help us understand why UI shows 1000kg but database shows 2000kg

-- Check all orders in the batch regardless of approval status
SELECT 
    'ALL ORDERS IN BATCH' as check_type,
    b.id as batch_id,
    b.barangay,
    b.total_weight as db_weight,
    COUNT(o.id) as total_orders,
    COUNT(CASE WHEN o.approval_status = 'approved' THEN 1 END) as approved_orders,
    COUNT(CASE WHEN o.approval_status != 'approved' THEN 1 END) as non_approved_orders
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.status IN ('pending', 'assigned')
GROUP BY b.id, b.barangay, b.total_weight
ORDER BY b.created_at DESC;

-- Check order details for each batch
SELECT 
    'ORDER DETAILS' as check_type,
    b.id as batch_id,
    b.barangay,
    o.id as order_id,
    o.approval_status,
    o.total_weight as order_total_weight,
    COUNT(oi.id) as item_count,
    -- Calculate weight from order items
    COALESCE(SUM(oi.quantity * p.weight), 0) as calculated_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
LEFT JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN products p ON p.id = oi.product_id
WHERE b.status IN ('pending', 'assigned')
GROUP BY b.id, b.barangay, o.id, o.approval_status, o.total_weight
ORDER BY b.created_at DESC, o.created_at DESC;

-- Check what the UI should be calculating (only approved orders)
SELECT 
    'UI CALCULATION (APPROVED ORDERS ONLY)' as check_type,
    b.id as batch_id,
    b.barangay,
    b.total_weight as db_weight,
    COUNT(CASE WHEN o.approval_status = 'approved' THEN 1 END) as approved_orders,
    -- This is what the UI calculates
    COALESCE(SUM(
        CASE WHEN o.approval_status = 'approved' THEN
            (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
             FROM order_items oi
             JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = o.id)
        ELSE 0 END
    ), 0) as ui_calculated_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id
WHERE b.status IN ('pending', 'assigned')
GROUP BY b.id, b.barangay, b.total_weight
ORDER BY b.created_at DESC;

-- Check what the database should be calculating (all approved orders)
SELECT 
    'DATABASE CALCULATION (ALL APPROVED ORDERS)' as check_type,
    b.id as batch_id,
    b.barangay,
    b.total_weight as current_db_weight,
    -- This is what the database should calculate
    COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id)
    ), 0) as should_be_db_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status IN ('pending', 'assigned')
GROUP BY b.id, b.barangay, b.total_weight
ORDER BY b.created_at DESC; 