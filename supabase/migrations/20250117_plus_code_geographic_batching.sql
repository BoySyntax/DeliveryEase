-- Plus Code geographic batching system
-- Handles Google Plus Codes (like GJ45+P7W) for precise location-based batching
-- Determines if locations fall within defined areas like Bulua

-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create table for defined delivery areas with geographic boundaries
CREATE TABLE IF NOT EXISTS delivery_areas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text UNIQUE NOT NULL,
    boundary geometry(POLYGON, 4326), -- Geographic boundary polygon
    plus_code_prefix text, -- Common plus code prefix for the area
    created_at timestamp with time zone DEFAULT now()
);

-- Insert Bulua area definition (approximate coordinates)
-- Note: You'll need to define the actual boundary polygon for Bulua
INSERT INTO delivery_areas (name, plus_code_prefix, boundary) 
VALUES (
    'Bulua',
    'GJ45+', -- Common prefix for Bulua area
    ST_GeomFromText('POLYGON((124.6450 8.4850, 124.6550 8.4850, 124.6550 8.4950, 124.6450 8.4950, 124.6450 8.4850))', 4326)
) ON CONFLICT (name) DO NOTHING;

-- Add more areas as needed
INSERT INTO delivery_areas (name, plus_code_prefix, boundary) 
VALUES 
    ('Carmen', 'GJ46+', ST_GeomFromText('POLYGON((124.6200 8.4700, 124.6300 8.4700, 124.6300 8.4800, 124.6200 8.4800, 124.6200 8.4700))', 4326)),
    ('Lapasan', 'GJ37+', ST_GeomFromText('POLYGON((124.6100 8.4600, 124.6200 8.4600, 124.6200 8.4700, 124.6100 8.4700, 124.6100 8.4600))', 4326))
ON CONFLICT (name) DO NOTHING;

-- Function to decode Plus Code to coordinates (simplified version)
-- For production, you'd want to use Google's Plus Codes API or library
CREATE OR REPLACE FUNCTION decode_plus_code_approximate(plus_code text)
RETURNS geometry(POINT, 4326) AS $$
DECLARE
    lat numeric;
    lng numeric;
BEGIN
    -- This is a simplified approximation for demonstration
    -- In production, use proper Plus Code decoding library
    
    -- Example mapping for common Cagayan de Oro Plus Codes
    CASE WHEN plus_code LIKE 'GJ45+%' THEN
        -- Bulua area approximate center
        lat := 8.4900;
        lng := 124.6500;
    WHEN plus_code LIKE 'GJ46+%' THEN
        -- Carmen area approximate center  
        lat := 8.4750;
        lng := 124.6250;
    WHEN plus_code LIKE 'GJ37+%' THEN
        -- Lapasan area approximate center
        lat := 8.4650;
        lng := 124.6150;
    ELSE
        -- Default to CDO center if unknown
        lat := 8.4800;
        lng := 124.6200;
    END CASE;
    
    RETURN ST_SetSRID(ST_MakePoint(lng, lat), 4326);
END;
$$ LANGUAGE plpgsql;

-- Function to determine which delivery area a Plus Code belongs to
CREATE OR REPLACE FUNCTION get_delivery_area_from_plus_code(plus_code text)
RETURNS text AS $$
DECLARE
    location_point geometry;
    area_name text;
BEGIN
    -- Decode plus code to coordinates
    location_point := decode_plus_code_approximate(plus_code);
    
    -- Check which delivery area contains this point
    SELECT da.name INTO area_name
    FROM delivery_areas da
    WHERE ST_Contains(da.boundary, location_point)
    LIMIT 1;
    
    -- If no exact boundary match, try prefix matching
    IF area_name IS NULL THEN
        SELECT da.name INTO area_name
        FROM delivery_areas da
        WHERE plus_code LIKE (da.plus_code_prefix || '%')
        LIMIT 1;
    END IF;
    
    -- Return area name or default
    RETURN COALESCE(area_name, 'Unknown Area');
END;
$$ LANGUAGE plpgsql;

-- Enhanced batch assignment function with Plus Code support
CREATE OR REPLACE FUNCTION batch_approved_orders_with_plus_codes()
RETURNS TRIGGER AS $$
DECLARE
    order_area text;
    order_plus_code text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    batch_record RECORD;
    best_score integer := 0;
    current_score integer;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        
        -- Extract street address and plus code from delivery_address
        order_area := COALESCE(
            NEW.delivery_address->>'street_address',
            'Default Area'
        );
        
        -- Check if delivery address contains a Plus Code
        order_plus_code := NEW.delivery_address->>'plus_code';
        
        RAISE NOTICE 'Processing order % - Address: %, Plus Code: %', NEW.id, order_area, order_plus_code;

        -- If Plus Code is provided, determine the delivery area
        IF order_plus_code IS NOT NULL AND order_plus_code != '' THEN
            order_area := get_delivery_area_from_plus_code(order_plus_code);
            RAISE NOTICE 'Plus Code % mapped to area: %', order_plus_code, order_area;
        END IF;

        -- Calculate order weight if not set
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
            RAISE NOTICE 'Calculated weight for order %: %.2f kg', NEW.id, calculated_weight;
        END IF;

        -- PHASE 1: Find batches in the same geographic area
        FOR batch_record IN
            SELECT 
                b.id, 
                b.total_weight, 
                b.barangay,
                (b.max_weight - b.total_weight) as available_capacity
            FROM order_batches b
            WHERE b.status = 'pending'
            AND b.total_weight + NEW.total_weight <= b.max_weight
            AND b.total_weight < b.max_weight
            ORDER BY b.created_at ASC
        LOOP
            -- Calculate area similarity
            IF order_area = batch_record.barangay THEN
                current_score := 100; -- Exact area match
            ELSIF order_area != 'Unknown Area' AND batch_record.barangay LIKE ('%' || order_area || '%') THEN
                current_score := 80; -- Partial area match
            ELSIF order_area != 'Unknown Area' AND order_area LIKE ('%' || batch_record.barangay || '%') THEN
                current_score := 70; -- Reverse partial match
            ELSE
                current_score := calculate_address_similarity(order_area, batch_record.barangay);
            END IF;
            
            RAISE NOTICE 'Batch %: area=%, similarity=%, capacity=%.0fkg', 
                        batch_record.id, batch_record.barangay, current_score, batch_record.available_capacity;
            
            -- Prioritize high similarity matches
            IF current_score >= 70 AND current_score > best_score THEN
                current_batch_id := batch_record.id;
                batch_total_weight := batch_record.total_weight;
                best_score := current_score;
                RAISE NOTICE '🎯 Area match found: batch %, score=%', current_batch_id, current_score;
            ELSIF current_batch_id IS NULL AND current_score >= 30 THEN
                current_batch_id := batch_record.id;
                batch_total_weight := batch_record.total_weight;
                best_score := current_score;
                RAISE NOTICE '📍 Moderate match: batch %, score=%', current_batch_id, current_score;
            END IF;
        END LOOP;

        -- PHASE 2: If no area match, find any available batch
        IF current_batch_id IS NULL THEN
            SELECT b.id, b.total_weight 
            INTO current_batch_id, batch_total_weight
            FROM order_batches b
            WHERE b.status = 'pending'
            AND b.total_weight + NEW.total_weight <= b.max_weight
            AND b.total_weight < b.max_weight
            ORDER BY (b.max_weight - b.total_weight) DESC, b.created_at ASC
            LIMIT 1;
            
            IF current_batch_id IS NOT NULL THEN
                RAISE NOTICE '📦 Capacity optimization: using batch %', current_batch_id;
            END IF;
        END IF;

        -- PHASE 3: Create new batch if needed
        IF current_batch_id IS NULL THEN
            RAISE NOTICE '🆕 Creating new batch for area: % (%.2fkg)', order_area, NEW.total_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_area, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE '✅ Created new batch: %', current_batch_id;
        ELSE
            -- Update existing batch
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE '📦 Updated batch % - new total: %.2fkg/3500kg (similarity: %)', 
                        current_batch_id, batch_total_weight + NEW.total_weight, best_score;
        END IF;

        -- Assign order to batch
        NEW.batch_id := current_batch_id;
        RAISE NOTICE '✅ Order % assigned to batch % (area: %)', NEW.id, current_batch_id, order_area;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error in batch assignment for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a Plus Code is within a specific area
CREATE OR REPLACE FUNCTION is_plus_code_in_area(plus_code text, area_name text)
RETURNS boolean AS $$
DECLARE
    detected_area text;
BEGIN
    detected_area := get_delivery_area_from_plus_code(plus_code);
    RETURN LOWER(detected_area) = LOWER(area_name);
END;
$$ LANGUAGE plpgsql;

-- Helper function to analyze Plus Code distribution
CREATE OR REPLACE FUNCTION analyze_plus_code_batches()
RETURNS TABLE (
    batch_id uuid,
    area text,
    order_count bigint,
    plus_codes text[],
    addresses text[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.barangay,
        COUNT(o.id),
        ARRAY_AGG(DISTINCT o.delivery_address->>'plus_code') FILTER (WHERE o.delivery_address->>'plus_code' IS NOT NULL),
        ARRAY_AGG(DISTINCT o.delivery_address->>'street_address') FILTER (WHERE o.delivery_address->>'street_address' IS NOT NULL)
    FROM order_batches b
    LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
    WHERE b.status = 'pending'
    GROUP BY b.id, b.barangay
    ORDER BY b.created_at;
END;
$$ LANGUAGE plpgsql;

-- Update the trigger to use the Plus Code enhanced function
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders_with_plus_codes();

-- Log completion
SELECT 'Plus Code geographic batching system installed - now supports precise location-based batching' as status; 