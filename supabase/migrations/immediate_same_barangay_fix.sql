-- Immediate fix for same barangay orders being in different batches
-- Run this script to consolidate existing orders

-- Function to fix existing orders that are in different batches for the same barangay
CREATE OR REPLACE FUNCTION fix_same_barangay_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_record RECORD;
    target_batch_id uuid;
    source_batch_id uuid;
    fixed_count INTEGER := 0;
    max_weight_limit decimal := 3500;
BEGIN
    -- For each barangay that has multiple pending batches
    FOR batch_record IN 
        SELECT barangay, COUNT(*) as batch_count
        FROM order_batches 
        WHERE status = 'pending'
        GROUP BY barangay
        HAVING COUNT(*) > 1
    LOOP
        -- Find the oldest batch for this barangay to use as the target
        SELECT id INTO target_batch_id
        FROM order_batches 
        WHERE status = 'pending' 
        AND LOWER(barangay) = LOWER(batch_record.barangay)
        ORDER BY created_at ASC
        LIMIT 1;
        
        -- Move orders from other batches to the target batch
        FOR order_record IN 
            SELECT o.id, o.batch_id, o.total_weight
            FROM orders o
            JOIN order_batches b ON b.id = o.batch_id
            WHERE b.status = 'pending'
            AND LOWER(b.barangay) = LOWER(batch_record.barangay)
            AND b.id != target_batch_id
            AND o.approval_status = 'approved'
        LOOP
            -- Check if moving this order would exceed the target batch capacity
            DECLARE
                target_batch_weight decimal;
                new_total_weight decimal;
            BEGIN
                SELECT total_weight INTO target_batch_weight
                FROM order_batches 
                WHERE id = target_batch_id;
                
                new_total_weight := target_batch_weight + order_record.total_weight;
                
                -- If it would exceed capacity, create a new batch
                IF new_total_weight > max_weight_limit THEN
                    INSERT INTO order_batches (barangay, total_weight, max_weight, status)
                    VALUES (batch_record.barangay, order_record.total_weight, max_weight_limit, 'pending')
                    RETURNING id INTO source_batch_id;
                    
                    UPDATE orders 
                    SET batch_id = source_batch_id
                    WHERE id = order_record.id;
                ELSE
                    -- Move to target batch
                    UPDATE orders 
                    SET batch_id = target_batch_id
                    WHERE id = order_record.id;
                    
                    -- Update target batch weight
                    UPDATE order_batches 
                    SET total_weight = new_total_weight
                    WHERE id = target_batch_id;
                END IF;
                
                fixed_count := fixed_count + 1;
            END;
        END LOOP;
        
        -- Delete empty batches (except the target batch)
        DELETE FROM order_batches 
        WHERE status = 'pending'
        AND LOWER(barangay) = LOWER(batch_record.barangay)
        AND id != target_batch_id
        AND id NOT IN (
            SELECT DISTINCT batch_id 
            FROM orders 
            WHERE batch_id IS NOT NULL
        );
    END LOOP;
    
    IF fixed_count > 0 THEN
        RETURN format('Fixed %s orders to ensure same barangay batching', fixed_count);
    ELSE
        RETURN 'No orders needed fixing';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Run the fix function
SELECT fix_same_barangay_batches();

-- Also run consolidation to clean up any remaining issues
SELECT consolidate_underweight_batches();

-- Clean up empty batches
SELECT cleanup_empty_batches();

-- Show the results
SELECT 'Same barangay batching fix completed!' as status; 