-- Migration: Implement automatic batch merging based on delivery coordinates
-- This will merge neighboring batches at 8PM to ensure daily delivery

-- Step 1: Create distance calculation function
CREATE OR REPLACE FUNCTION calculate_distance_km(
    lat1 decimal, lng1 decimal,
    lat2 decimal, lng2 decimal
) RETURNS decimal
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN 6371 * acos(
        cos(radians(lat1)) * cos(radians(lat2)) * 
        cos(radians(lng2) - radians(lng1)) + 
        sin(radians(lat1)) * sin(radians(lat2))
    );
END;
$$;

-- Step 2: Create function to check if two batches are neighbors
CREATE OR REPLACE FUNCTION is_neighboring_batches(
    batch1_id uuid,
    batch2_id uuid,
    max_distance_km decimal DEFAULT 5.0
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    batch1_lat decimal;
    batch1_lng decimal;
    batch2_lat decimal;
    batch2_lng decimal;
    distance_km decimal;
BEGIN
    -- Get average coordinates for batch1 from delivery addresses
    SELECT 
        AVG((delivery_address->>'latitude')::decimal),
        AVG((delivery_address->>'longitude')::decimal)
    INTO batch1_lat, batch1_lng
    FROM orders 
    WHERE batch_id = batch1_id
    AND delivery_address->>'latitude' IS NOT NULL
    AND delivery_address->>'longitude' IS NOT NULL;
    
    -- Get average coordinates for batch2 from delivery addresses
    SELECT 
        AVG((delivery_address->>'latitude')::decimal),
        AVG((delivery_address->>'longitude')::decimal)
    INTO batch2_lat, batch2_lng
    FROM orders 
    WHERE batch_id = batch2_id
    AND delivery_address->>'latitude' IS NOT NULL
    AND delivery_address->>'longitude' IS NOT NULL;
    
    -- If coordinates not found, return false
    IF batch1_lat IS NULL OR batch2_lat IS NULL THEN
        RETURN false;
    END IF;
    
    -- Calculate distance between batch centers
    distance_km := calculate_distance_km(
        batch1_lat, batch1_lng,
        batch2_lat, batch2_lng
    );
    
    -- Consider neighbors if within max distance
    RETURN distance_km <= max_distance_km;
END;
$$;

-- Step 3: Create function to merge neighboring batches
CREATE OR REPLACE FUNCTION merge_batches_by_delivery_coordinates()
RETURNS TABLE(
    merged_batch_id uuid,
    source_batch_id uuid,
    source_barangay text,
    merged_weight decimal,
    distance_km decimal,
    action_taken text
)
LANGUAGE plpgsql
AS $$
DECLARE
    batch_record RECORD;
    neighbor_batch RECORD;
    merged_weight decimal;
    distance_km decimal;
    closest_batch_id uuid;
    closest_distance decimal;
    merged_count integer := 0;
BEGIN
    -- Find all pending batches under 3500kg
    FOR batch_record IN 
        SELECT id, barangay, total_weight
        FROM order_batches 
        WHERE status = 'pending'
        AND total_weight < 3500
        ORDER BY total_weight DESC
    LOOP
        -- Find the CLOSEST neighboring batch
        closest_batch_id := NULL;
        closest_distance := 999999;
        
        FOR neighbor_batch IN 
            SELECT b.id, b.barangay, b.total_weight
            FROM order_batches b
            WHERE b.status = 'pending'
            AND b.id != batch_record.id
            AND b.total_weight < 3500
            AND (batch_record.total_weight + b.total_weight) <= 3500
        LOOP
            -- Check if they are neighbors using delivery coordinates
            IF is_neighboring_batches(batch_record.id, neighbor_batch.id, 10.0) THEN
                -- Calculate exact distance
                SELECT calculate_distance_km(
                    (SELECT AVG((delivery_address->>'latitude')::decimal) FROM orders WHERE batch_id = batch_record.id),
                    (SELECT AVG((delivery_address->>'longitude')::decimal) FROM orders WHERE batch_id = batch_record.id),
                    (SELECT AVG((delivery_address->>'latitude')::decimal) FROM orders WHERE batch_id = neighbor_batch.id),
                    (SELECT AVG((delivery_address->>'longitude')::decimal) FROM orders WHERE batch_id = neighbor_batch.id)
                ) INTO distance_km;
                
                -- Keep track of closest batch
                IF distance_km < closest_distance THEN
                    closest_distance := distance_km;
                    closest_batch_id := neighbor_batch.id;
                END IF;
            END IF;
        END LOOP;
        
        -- Merge with the closest batch if found
        IF closest_batch_id IS NOT NULL THEN
            -- Get the closest batch details
            SELECT id, barangay, total_weight
            INTO neighbor_batch
            FROM order_batches 
            WHERE id = closest_batch_id;
            
            merged_weight := batch_record.total_weight + neighbor_batch.total_weight;
            
            -- Update the main batch
            UPDATE order_batches 
            SET total_weight = merged_weight
            WHERE id = batch_record.id;
            
            -- Move orders from neighbor batch to main batch
            UPDATE orders 
            SET batch_id = batch_record.id
            WHERE batch_id = neighbor_batch.id;
            
            -- Return merge result
            merged_batch_id := batch_record.id;
            source_batch_id := neighbor_batch.id;
            source_barangay := neighbor_batch.barangay;
            merged_weight := merged_weight;
            distance_km := closest_distance;
            action_taken := 'Merged with ' || neighbor_batch.barangay;
            RETURN NEXT;
            
            -- Delete the neighbor batch
            DELETE FROM order_batches 
            WHERE id = neighbor_batch.id;
            
            merged_count := merged_count + 1;
        END IF;
    END LOOP;
    
    -- If no merges happened, return empty result
    IF merged_count = 0 THEN
        merged_batch_id := NULL;
        source_batch_id := NULL;
        source_barangay := 'No merges needed';
        merged_weight := 0;
        distance_km := 0;
        action_taken := 'No neighboring batches found to merge';
        RETURN NEXT;
    END IF;
END;
$$;

-- Step 4: Create 8PM processing function
CREATE OR REPLACE FUNCTION process_8pm_batch_merging()
RETURNS TABLE(
    batch_id uuid,
    barangay text,
    total_weight decimal,
    status text,
    action_taken text
)
LANGUAGE plpgsql
AS $$
DECLARE
    merge_result RECORD;
    batch_record RECORD;
BEGIN
    -- First, merge neighboring batches
    FOR merge_result IN 
        SELECT * FROM merge_batches_by_delivery_coordinates()
    LOOP
        -- Return merge results
        batch_id := merge_result.merged_batch_id;
        barangay := 'Merged batch';
        total_weight := merge_result.merged_weight;
        status := 'Merged';
        action_taken := merge_result.action_taken || ' (distance: ' || ROUND(merge_result.distance_km, 2) || 'km)';
        RETURN NEXT;
    END LOOP;
    
    -- Then mark all remaining batches as ready for delivery
    FOR batch_record IN 
        SELECT id, barangay, total_weight
        FROM order_batches 
        WHERE status = 'pending'
    LOOP
        UPDATE order_batches 
        SET status = 'ready_for_delivery'
        WHERE id = batch_record.id;
        
        batch_id := batch_record.id;
        barangay := batch_record.barangay;
        total_weight := batch_record.total_weight;
        status := 'ready_for_delivery';
        action_taken := 'Marked as ready for delivery';
        RETURN NEXT;
    END LOOP;
END;
$$;

-- Step 5: Create test function to see current batch status
CREATE OR REPLACE FUNCTION get_batch_merging_status()
RETURNS TABLE(
    batch_id uuid,
    barangay text,
    total_weight decimal,
    status text,
    order_count bigint,
    avg_lat decimal,
    avg_lng decimal
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.barangay,
        b.total_weight,
        b.status,
        COUNT(o.id) as order_count,
        AVG((o.delivery_address->>'latitude')::decimal) as avg_lat,
        AVG((o.delivery_address->>'longitude')::decimal) as avg_lng
    FROM order_batches b
    LEFT JOIN orders o ON o.batch_id = b.id
    WHERE b.status IN ('pending', 'ready_for_delivery')
    GROUP BY b.id, b.barangay, b.total_weight, b.status
    ORDER BY b.total_weight DESC;
END;
$$;

-- Test the functions
SELECT 'Batch merging functions created successfully!' as status;
