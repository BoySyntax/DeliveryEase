-- Geographic-aware batch assignment logic
-- Groups orders by proximity of street addresses for efficient delivery routes
-- Balances geographic clustering with capacity optimization

DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;

-- Create function to calculate street address similarity
CREATE OR REPLACE FUNCTION calculate_address_similarity(addr1 text, addr2 text)
RETURNS INTEGER AS $$
BEGIN
    -- Simple similarity scoring based on common words and proximity
    -- Returns score from 0-100 (higher = more similar)
    
    IF addr1 IS NULL OR addr2 IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Exact match
    IF LOWER(addr1) = LOWER(addr2) THEN
        RETURN 100;
    END IF;
    
    -- Extract key location words (street names, subdivisions, etc.)
    -- Check for common street names, subdivisions, or area indicators
    DECLARE
        addr1_clean text := LOWER(TRIM(addr1));
        addr2_clean text := LOWER(TRIM(addr2));
        common_words text[] := ARRAY['street', 'st', 'road', 'rd', 'avenue', 'ave', 'blvd', 'boulevard', 'drive', 'dr', 'subdivision', 'village', 'barangay'];
        similarity_score integer := 0;
        word1 text;
        word2 text;
    BEGIN
        -- Check for shared street names or key location identifiers
        FOREACH word1 IN ARRAY string_to_array(addr1_clean, ' ')
        LOOP
            -- Skip common words
            IF NOT (word1 = ANY(common_words)) AND length(word1) > 2 THEN
                FOREACH word2 IN ARRAY string_to_array(addr2_clean, ' ')
                LOOP
                    IF word1 = word2 THEN
                        similarity_score := similarity_score + 30;
                    ELSIF levenshtein(word1, word2) <= 2 AND length(word1) > 3 THEN
                        similarity_score := similarity_score + 15;
                    END IF;
                END LOOP;
            END IF;
        END LOOP;
        
        -- Cap the score at 100
        RETURN LEAST(similarity_score, 100);
    END;
END;
$$ LANGUAGE plpgsql;

-- Enhanced batch assignment function with geographic awareness
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_area text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    batch_record RECORD;
    best_score integer := 0;
    current_score integer;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Extract delivery address
        order_area := COALESCE(
            NEW.delivery_address->>'street_address',
            'Default Area'
        );
        
        RAISE NOTICE 'Processing order % for address: %', NEW.id, order_area;

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

        -- PHASE 1: Find batches in the same geographic area with capacity
        FOR batch_record IN
            SELECT 
                b.id, 
                b.total_weight, 
                b.barangay,
                (b.max_weight - b.total_weight) as available_capacity
            FROM order_batches b
            WHERE b.status = 'pending'  -- Only pending batches
            AND b.total_weight + NEW.total_weight <= b.max_weight  -- Order fits
            AND b.total_weight < b.max_weight  -- Not at full capacity
            ORDER BY b.created_at ASC  -- Older batches first
        LOOP
            -- Calculate geographic similarity
            current_score := calculate_address_similarity(order_area, batch_record.barangay);
            
            RAISE NOTICE 'Batch %: area=%, similarity=%, capacity=%.0fkg', 
                        batch_record.id, batch_record.barangay, current_score, batch_record.available_capacity;
            
            -- Prioritize batches with high geographic similarity (60+ score)
            IF current_score >= 60 AND current_score > best_score THEN
                current_batch_id := batch_record.id;
                batch_total_weight := batch_record.total_weight;
                best_score := current_score;
                RAISE NOTICE '🎯 High similarity match found: batch %, score=%', current_batch_id, current_score;
            -- If no high similarity match yet, accept moderate similarity (30+ score)
            ELSIF current_batch_id IS NULL AND current_score >= 30 THEN
                current_batch_id := batch_record.id;
                batch_total_weight := batch_record.total_weight;
                best_score := current_score;
                RAISE NOTICE '📍 Moderate similarity match: batch %, score=%', current_batch_id, current_score;
            END IF;
        END LOOP;

        -- PHASE 2: If no geographic match, find any available batch (capacity optimization)
        IF current_batch_id IS NULL THEN
            SELECT b.id, b.total_weight 
            INTO current_batch_id, batch_total_weight
            FROM order_batches b
            WHERE b.status = 'pending'
            AND b.total_weight + NEW.total_weight <= b.max_weight
            AND b.total_weight < b.max_weight
            ORDER BY 
                -- Prioritize batches with most remaining capacity
                (b.max_weight - b.total_weight) DESC,
                b.created_at ASC
            LIMIT 1;
            
            IF current_batch_id IS NOT NULL THEN
                RAISE NOTICE '📦 Capacity optimization: using batch % (no geographic match)', current_batch_id;
            END IF;
        END IF;

        -- PHASE 3: Create new batch if no suitable batch found
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
            
            RAISE NOTICE '📦 Updated batch % - new total: %.2fkg/3500kg (similarity score: %)', 
                        current_batch_id, batch_total_weight + NEW.total_weight, best_score;
            
            -- Log capacity status
            IF (batch_total_weight + NEW.total_weight) >= 3500 THEN
                RAISE NOTICE '🚚 Batch % FULL - ready for driver assignment!', current_batch_id;
            ELSIF (batch_total_weight + NEW.total_weight) >= 3000 THEN
                RAISE NOTICE '⚠️  Batch % near capacity (%.0f%%)', 
                            current_batch_id, ((batch_total_weight + NEW.total_weight) / 3500.0 * 100);
            END IF;
        END IF;

        -- Assign order to batch
        NEW.batch_id := current_batch_id;
        RAISE NOTICE '✅ Order % assigned to batch % (geographic score: %)', NEW.id, current_batch_id, best_score;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error in batch assignment for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- Helper function to analyze batch geographic distribution
CREATE OR REPLACE FUNCTION analyze_batch_geography()
RETURNS TABLE (
    batch_id uuid,
    area text,
    order_count bigint,
    total_weight numeric,
    capacity_used numeric,
    addresses text[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.barangay,
        COUNT(o.id),
        b.total_weight,
        ROUND((b.total_weight / b.max_weight * 100)::numeric, 1),
        ARRAY_AGG(DISTINCT o.delivery_address->>'street_address') FILTER (WHERE o.delivery_address->>'street_address' IS NOT NULL)
    FROM order_batches b
    LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
    WHERE b.status = 'pending'
    GROUP BY b.id, b.barangay, b.total_weight, b.max_weight
    ORDER BY b.created_at;
END;
$$ LANGUAGE plpgsql;

-- Log completion
SELECT 'Geographic-aware batch assignment applied - orders will be grouped by street address proximity' as status; 