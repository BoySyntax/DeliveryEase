-- Immediate fix for batch weight discrepancy
-- This will update all batch weights to match the actual calculated weight from order items

-- First, let's see the current discrepancy
SELECT 
    b.id,
    b.barangay,
    b.total_weight as current_db_weight,
    b.max_weight,
    COUNT(o.id) as order_count,
    -- Calculate actual weight from order items
    COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id)
    ), 0) as calculated_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status IN ('pending', 'assigned')
GROUP BY b.id, b.barangay, b.total_weight, b.max_weight
ORDER BY b.created_at DESC;

-- Update all batch weights to match the calculated weight from order items
UPDATE order_batches 
SET total_weight = (
    SELECT COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id)
    ), 0)
    FROM orders o
    WHERE o.batch_id = order_batches.id 
    AND o.approval_status = 'approved'
)
WHERE status IN ('pending', 'assigned');

-- Verify the fix
SELECT 
    b.id,
    b.barangay,
    b.total_weight as updated_weight,
    b.max_weight,
    COUNT(o.id) as order_count,
    -- Calculate actual weight from order items to verify
    COALESCE(SUM(
        (SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = o.id)
    ), 0) as calculated_weight
FROM order_batches b
LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
WHERE b.status IN ('pending', 'assigned')
GROUP BY b.id, b.barangay, b.total_weight, b.max_weight
ORDER BY b.created_at DESC;

-- Show summary
SELECT 
    'BATCH WEIGHT FIX COMPLETE' as status,
    COUNT(*) as total_batches,
    SUM(CASE WHEN total_weight = 0 THEN 1 ELSE 0 END) as empty_batches,
    SUM(CASE WHEN total_weight > max_weight THEN 1 ELSE 0 END) as overweight_batches
FROM order_batches 
WHERE status IN ('pending', 'assigned'); 