-- Barangay-based batching system
-- Users select their barangay, orders are grouped by barangay for efficient delivery routes
-- Much simpler and more practical for Philippines delivery system

DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;

-- Create table for barangay definitions in Region 10 (Northern Mindanao) delivery areas
CREATE TABLE IF NOT EXISTS barangays (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    city text NOT NULL,
    province text NOT NULL,
    region text DEFAULT 'Region 10 (Northern Mindanao)',
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(name, city) -- Allow same barangay names in different cities
);

-- Insert barangays from Region 10 cities
-- CAGAYAN DE ORO CITY (Misamis Oriental)
INSERT INTO barangays (name, city, province) VALUES 
    -- Major barangays in Cagayan de Oro
    ('Bulua', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Carmen', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Lapasan', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Nazareth', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Gusa', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Macasandig', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Kauswagan', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Consolacion', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Tablon', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Agusan', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Balulang', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Bayabas', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Bayanga', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Besiga', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Bonbon', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Bugo', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Camaman-an', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Canitoan', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Cugman', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Dansolihon', 'Cagayan de Oro', 'Misamis Oriental'),
    ('F.S. Catanico', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Iponan', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Lumbia', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Macabalan', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Mambuaya', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Patag', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Pagatpat', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Pigsag-an', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Puerto', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Puntod', 'Cagayan de Oro', 'Misamis Oriental'),
    ('San Simon', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Tagpangi', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Tignapoloan', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Tuburan', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Tumpagon', 'Cagayan de Oro', 'Misamis Oriental'),
    
    -- Downtown Barangays (numbered)
    ('Barangay 1', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 2', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 3', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 4', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 5', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 6', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 7', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 8', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 9', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 10', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 11', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 12', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 13', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 14', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 15', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 16', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 17', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 18', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 19', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 20', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 21', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 22', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 23', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 24', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 25', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 26', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 27', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 28', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 29', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 30', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 31', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 32', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 33', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 34', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 35', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 36', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 37', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 38', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 39', 'Cagayan de Oro', 'Misamis Oriental'),
    ('Barangay 40', 'Cagayan de Oro', 'Misamis Oriental'),
    
    -- ILIGAN CITY (Lanao del Norte) - Major barangays
    ('Poblacion', 'Iligan', 'Lanao del Norte'),
    ('Pala-o', 'Iligan', 'Lanao del Norte'),
    ('Sabalete', 'Iligan', 'Lanao del Norte'),
    ('Tibanga', 'Iligan', 'Lanao del Norte'),
    ('Tipanoy', 'Iligan', 'Lanao del Norte'),
    ('Tubod', 'Iligan', 'Lanao del Norte'),
    ('Buru-un', 'Iligan', 'Lanao del Norte'),
    ('Hinaplanon', 'Iligan', 'Lanao del Norte'),
    ('Kiwalan', 'Iligan', 'Lanao del Norte'),
    ('Luinab', 'Iligan', 'Lanao del Norte'),
    ('Mahayahay', 'Iligan', 'Lanao del Norte'),
    ('Mandulog', 'Iligan', 'Lanao del Norte'),
    ('Maria Cristina', 'Iligan', 'Lanao del Norte'),
    ('Palao', 'Iligan', 'Lanao del Norte'),
    ('San Miguel', 'Iligan', 'Lanao del Norte'),
    ('San Roque', 'Iligan', 'Lanao del Norte'),
    ('Santa Elena', 'Iligan', 'Lanao del Norte'),
    ('Santa Filomena', 'Iligan', 'Lanao del Norte'),
    ('Santiago', 'Iligan', 'Lanao del Norte'),
    ('Santo Rosario', 'Iligan', 'Lanao del Norte'),
    ('Suarez', 'Iligan', 'Lanao del Norte'),
    
    -- MALAYBALAY CITY (Bukidnon) - Capital of Bukidnon
    ('Poblacion', 'Malaybalay', 'Bukidnon'),
    ('Aglayan', 'Malaybalay', 'Bukidnon'),
    ('Bangcud', 'Malaybalay', 'Bukidnon'),
    ('Barobo', 'Malaybalay', 'Bukidnon'),
    ('Busdi', 'Malaybalay', 'Bukidnon'),
    ('Cabangahan', 'Malaybalay', 'Bukidnon'),
    ('Can-ayan', 'Malaybalay', 'Bukidnon'),
    ('Casisang', 'Malaybalay', 'Bukidnon'),
    ('Dalwangan', 'Malaybalay', 'Bukidnon'),
    ('Kalasungay', 'Malaybalay', 'Bukidnon'),
    ('Kibawe', 'Malaybalay', 'Bukidnon'),
    ('Laguitas', 'Malaybalay', 'Bukidnon'),
    ('Lantapan', 'Malaybalay', 'Bukidnon'),
    ('Linabo', 'Malaybalay', 'Bukidnon'),
    ('Mailag', 'Malaybalay', 'Bukidnon'),
    ('Managok', 'Malaybalay', 'Bukidnon'),
    ('Patpat', 'Malaybalay', 'Bukidnon'),
    ('San Jose', 'Malaybalay', 'Bukidnon'),
    ('Sumpong', 'Malaybalay', 'Bukidnon'),
    ('Violeta', 'Malaybalay', 'Bukidnon'),
    
    -- VALENCIA CITY (Bukidnon)
    ('Poblacion', 'Valencia', 'Bukidnon'),
    ('Bagontaas', 'Valencia', 'Bukidnon'),
    ('Banlag', 'Valencia', 'Bukidnon'),
    ('Batangan', 'Valencia', 'Bukidnon'),
    ('Catumbalon', 'Valencia', 'Bukidnon'),
    ('Lumbayao', 'Valencia', 'Bukidnon'),
    ('Mailag', 'Valencia', 'Bukidnon'),
    ('San Carlos', 'Valencia', 'Bukidnon'),
    ('Sugbongcogon', 'Valencia', 'Bukidnon'),
    ('Tongantongan', 'Valencia', 'Bukidnon'),
    
    -- OROQUIETA CITY (Misamis Occidental)
    ('Poblacion', 'Oroquieta', 'Misamis Occidental'),
    ('Apil', 'Oroquieta', 'Misamis Occidental'),
    ('Bunyasan', 'Oroquieta', 'Misamis Occidental'),
    ('Dolipos Alto', 'Oroquieta', 'Misamis Occidental'),
    ('Dolipos Bajo', 'Oroquieta', 'Misamis Occidental'),
    ('Dullan Norte', 'Oroquieta', 'Misamis Occidental'),
    ('Dullan Sur', 'Oroquieta', 'Misamis Occidental'),
    ('Layawan', 'Oroquieta', 'Misamis Occidental'),
    ('Malindang', 'Oroquieta', 'Misamis Occidental'),
    ('Mialen', 'Oroquieta', 'Misamis Occidental'),
    ('Mobod', 'Oroquieta', 'Misamis Occidental'),
    ('Paypay', 'Oroquieta', 'Misamis Occidental'),
    ('Proper', 'Oroquieta', 'Misamis Occidental'),
    ('Senote', 'Oroquieta', 'Misamis Occidental'),
    ('Tipan', 'Oroquieta', 'Misamis Occidental'),
    ('Tugaya', 'Oroquieta', 'Misamis Occidental'),
    ('Upper Lamac', 'Oroquieta', 'Misamis Occidental'),
    ('Victoria', 'Oroquieta', 'Misamis Occidental')
ON CONFLICT (name, city) DO NOTHING;

-- Barangay-based batch assignment function
CREATE OR REPLACE FUNCTION batch_approved_orders_by_barangay()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        
        -- Extract barangay from delivery_address
        order_barangay := COALESCE(
            NEW.delivery_address->>'barangay',
            NEW.delivery_address->>'street_address', -- fallback
            'Unknown Barangay'
        );
        
        RAISE NOTICE 'Processing order % for barangay: %', NEW.id, order_barangay;

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

        -- PRIORITY 1: Find existing batch in the SAME BARANGAY with available capacity
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'  -- Only pending batches
        AND LOWER(b.barangay) = LOWER(order_barangay)  -- Exact barangay match
        AND b.total_weight + NEW.total_weight <= b.max_weight  -- Order fits
        AND b.total_weight < b.max_weight  -- Not at full capacity
        ORDER BY 
            -- Prioritize batches with most remaining space
            (b.max_weight - b.total_weight) DESC,
            -- Then older batches
            b.created_at ASC
        LIMIT 1;

        IF current_batch_id IS NOT NULL THEN
            RAISE NOTICE '🎯 Found existing batch in %: % (%.0fkg available)', 
                        order_barangay, current_batch_id, (3500 - batch_total_weight);
        END IF;

        -- PRIORITY 2: If no same-barangay batch, find ANY available batch (capacity optimization)
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
                RAISE NOTICE '📦 Using available batch from different area (capacity optimization): %', current_batch_id;
            END IF;
        END IF;

        -- PRIORITY 3: Create new batch for this barangay
        IF current_batch_id IS NULL THEN
            RAISE NOTICE '🆕 Creating new batch for barangay: % (%.2fkg)', order_barangay, NEW.total_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, 3500, 'pending')
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE '✅ Created new batch % for barangay: %', current_batch_id, order_barangay;
        ELSE
            -- Update existing batch
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE '📦 Updated batch % - new total: %.2fkg/3500kg', 
                        current_batch_id, batch_total_weight + NEW.total_weight;
            
            -- Log capacity status
            IF (batch_total_weight + NEW.total_weight) >= 3500 THEN
                RAISE NOTICE '🚚 Batch % FULL (%.1fkg) - ready for driver assignment!', 
                            current_batch_id, batch_total_weight + NEW.total_weight;
            ELSIF (batch_total_weight + NEW.total_weight) >= 3000 THEN
                RAISE NOTICE '⚠️  Batch % near capacity (%.0f%% full)', 
                            current_batch_id, ((batch_total_weight + NEW.total_weight) / 3500.0 * 100);
            END IF;
        END IF;

        -- Assign order to batch
        NEW.batch_id := current_batch_id;
        RAISE NOTICE '✅ Order % assigned to batch % (barangay: %)', NEW.id, current_batch_id, order_barangay;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error in barangay batch assignment for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders_by_barangay();

-- Helper function to get active barangays for frontend dropdown
CREATE OR REPLACE FUNCTION get_active_barangays()
RETURNS TABLE (
    id uuid,
    name text,
    city text,
    province text,
    region text,
    display_name text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id, 
        b.name, 
        b.city, 
        b.province,
        b.region,
        CASE 
            WHEN b.city = 'Cagayan de Oro' THEN b.name
            ELSE b.name || ', ' || b.city
        END as display_name
    FROM barangays b
    WHERE b.active = true
    ORDER BY b.city, b.name;
END;
$$ LANGUAGE plpgsql;

-- Function to analyze batch distribution by barangay
CREATE OR REPLACE FUNCTION analyze_barangay_batches()
RETURNS TABLE (
    batch_id uuid,
    barangay text,
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
    ORDER BY b.barangay, b.created_at;
END;
$$ LANGUAGE plpgsql;

-- Function to get batch summary by barangay
CREATE OR REPLACE FUNCTION get_barangay_batch_summary()
RETURNS TABLE (
    barangay text,
    batch_count bigint,
    total_orders bigint,
    total_weight numeric,
    avg_capacity_used numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.barangay,
        COUNT(DISTINCT b.id),
        COUNT(o.id),
        SUM(b.total_weight),
        ROUND(AVG(b.total_weight / b.max_weight * 100)::numeric, 1)
    FROM order_batches b
    LEFT JOIN orders o ON o.batch_id = b.id AND o.approval_status = 'approved'
    WHERE b.status = 'pending'
    GROUP BY b.barangay
    ORDER BY b.barangay;
END;
$$ LANGUAGE plpgsql;

-- Log completion
SELECT 'Barangay-based batching system applied - orders will be grouped by barangay selection' as status; 