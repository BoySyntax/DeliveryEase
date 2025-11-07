-- MANUAL BATCH TEST: Test the batching system manually
-- Use this to test if batching is working correctly

-- Function to manually test batching for a specific order
CREATE OR REPLACE FUNCTION test_batch_order(order_id uuid)
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    detected_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    min_weight_threshold decimal := 3500;
    max_weight_capacity decimal := 5000;
    result_text text;
BEGIN
    -- Get the order
    SELECT o.*, o.delivery_address
    INTO order_record
    FROM orders o
    WHERE o.id = order_id;
    
    IF order_record.id IS NULL THEN
        RETURN 'Order not found';
    END IF;
    
    -- Extract barangay
    detected_barangay := extract_barangay_ultimate(order_record.delivery_address);
    
    -- Calculate weight
    SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
    INTO calculated_weight
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = order_id;
    
    IF calculated_weight <= 0 THEN
        calculated_weight := 1;
    END IF;
    
    -- Find existing batch
    SELECT b.id, b.total_weight
    INTO current_batch_id, batch_total_weight
    FROM order_batches b
    WHERE b.status = 'pending'
    AND b.barangay = detected_barangay
    AND b.total_weight + calculated_weight <= max_weight_capacity
    ORDER BY (max_weight_capacity - b.total_weight) DESC, b.created_at ASC
    LIMIT 1;
    
    -- Create new batch or add to existing
    IF current_batch_id IS NULL THEN
        INSERT INTO order_batches (barangay, total_weight, max_weight, status)
        VALUES (detected_barangay, calculated_weight, max_weight_capacity, 'pending')
        RETURNING id INTO current_batch_id;
        
        result_text := format('Created new batch %s for barangay: %s (weight: %s kg)', 
            current_batch_id, detected_barangay, calculated_weight);
    ELSE
        UPDATE order_batches 
        SET total_weight = batch_total_weight + calculated_weight
        WHERE id = current_batch_id;
        
        result_text := format('Added to existing batch %s (barangay: %s, total weight: %s kg)', 
            current_batch_id, detected_barangay, batch_total_weight + calculated_weight);
    END IF;
    
    -- Update the order
    UPDATE orders 
    SET batch_id = current_batch_id, total_weight = calculated_weight
    WHERE id = order_id;
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- Function to show current batch status
CREATE OR REPLACE FUNCTION show_batch_status()
RETURNS TABLE(
    batch_id uuid,
    barangay text,
    total_weight decimal,
    max_weight decimal,
    status text,
    order_count bigint,
    created_at timestamp with time zone
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.barangay,
        b.total_weight,
        b.max_weight,
        b.status,
        COUNT(o.id) as order_count,
        b.created_at
    FROM order_batches b
    LEFT JOIN orders o ON o.batch_id = b.id
    GROUP BY b.id, b.barangay, b.total_weight, b.max_weight, b.status, b.created_at
    ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to show orders without batch_id
CREATE OR REPLACE FUNCTION show_orders_without_batch()
RETURNS TABLE(
    order_id uuid,
    customer_name text,
    barangay text,
    total_weight decimal,
    approval_status text,
    created_at timestamp with time zone
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        p.name,
        extract_barangay_ultimate(o.delivery_address) as barangay,
        o.total_weight,
        o.approval_status,
        o.created_at
    FROM orders o
    LEFT JOIN profiles p ON p.id = o.customer_id
    WHERE o.approval_status = 'approved' 
    AND o.batch_id IS NULL
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Show current status
SELECT 'CURRENT BATCH STATUS:' as info;
SELECT * FROM show_batch_status();

SELECT 'ORDERS WITHOUT BATCH:' as info;
SELECT * FROM show_orders_without_batch();























