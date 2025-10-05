-- Debug version of the batching function to identify the 400 error
-- This will add more detailed error logging

CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
    min_weight_threshold decimal := 3500;  -- Minimum weight to assign batch
    max_weight_capacity decimal := 5000;   -- Maximum capacity per batch
    batch_status text;
    debug_info text;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        RAISE NOTICE '🔄 Processing order % for batching', NEW.id;
        
        -- Get the order's barangay from delivery_address
        -- Try multiple ways to extract barangay
        order_barangay := NEW.delivery_address->>'barangay';
        
        -- Debug: Log the delivery address
        RAISE NOTICE '📍 Order % delivery_address: %', NEW.id, NEW.delivery_address;
        RAISE NOTICE '📍 Extracted barangay (method 1): %', order_barangay;
        
        -- If barangay is not found in the 'barangay' field, try to extract from full address
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'null' THEN
            -- Try to extract from the full address string
            DECLARE
                full_address text;
                address_parts text[];
            BEGIN
                full_address := COALESCE(NEW.delivery_address->>'address', '');
                RAISE NOTICE '📍 Full address: %', full_address;
                
                -- Split address by comma and look for barangay patterns
                address_parts := string_to_array(full_address, ',');
                
                -- Look for barangay in the address parts
                FOR i IN 1..array_length(address_parts, 1) LOOP
                    DECLARE
                        part text;
                    BEGIN
                        part := trim(address_parts[i]);
                        RAISE NOTICE '📍 Address part %: %', i, part;
                        
                        -- Check if this part looks like a barangay (contains common barangay indicators)
                        IF part ILIKE '%barangay%' OR part ILIKE '%brgy%' OR 
                           (part ILIKE '%misamis%' AND part ILIKE '%oriental%') OR
                           (length(part) > 3 AND part NOT ILIKE '%city%' AND part NOT ILIKE '%philippines%') THEN
                            order_barangay := part;
                            RAISE NOTICE '📍 Found barangay in address part: %', order_barangay;
                            EXIT;
                        END IF;
                    END;
                END LOOP;
            END;
        END IF;
        
        -- If still no barangay found, try to extract from the last part of the address
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'null' THEN
            DECLARE
                full_address text;
                last_comma_pos int;
                last_part text;
            BEGIN
                full_address := COALESCE(NEW.delivery_address->>'address', '');
                last_comma_pos := position(',' in reverse(full_address));
                
                IF last_comma_pos > 0 THEN
                    last_part := trim(substring(full_address from length(full_address) - last_comma_pos + 2));
                    -- Remove "Philippines" if present
                    last_part := replace(last_part, 'Philippines', '');
                    last_part := trim(last_part);
                    
                    IF last_part != '' AND last_part NOT ILIKE '%city%' THEN
                        order_barangay := last_part;
                        RAISE NOTICE '📍 Extracted barangay from last part: %', order_barangay;
                    END IF;
                END IF;
            END;
        END IF;
        
        -- Final fallback
        IF order_barangay IS NULL OR order_barangay = '' OR order_barangay = 'null' THEN
            RAISE NOTICE '❌ No barangay found for order %. Delivery address: %', NEW.id, NEW.delivery_address;
            order_barangay := 'Unknown Location';
            RAISE NOTICE '⚠️ Using default barangay: %', order_barangay;
        ELSE
            RAISE NOTICE '✅ Successfully extracted barangay: %', order_barangay;
        END IF;

        -- Calculate order weight if not set
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            RAISE NOTICE '⚖️ Calculating weight for order %', NEW.id;
            
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            RAISE NOTICE '⚖️ Calculated weight: %kg', calculated_weight;
            NEW.total_weight := calculated_weight;
        ELSE
            RAISE NOTICE '⚖️ Using existing weight: %kg', NEW.total_weight;
        END IF;

        -- Validate weight is positive
        IF NEW.total_weight <= 0 THEN
            RAISE NOTICE '❌ Invalid weight for order %: %kg', NEW.id, NEW.total_weight;
            -- Instead of throwing exception, set a default weight
            NEW.total_weight := 1;
            RAISE NOTICE '⚠️ Using default weight: 1kg';
        END IF;

        -- Find an existing pending batch for this barangay that has capacity for this order
        RAISE NOTICE '🔍 Looking for existing batch in barangay: %', order_barangay;
        
        SELECT b.id, b.total_weight, b.status
        INTO current_batch_id, batch_total_weight, batch_status
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= max_weight_capacity
        ORDER BY (max_weight_capacity - b.total_weight) DESC, b.created_at ASC
        LIMIT 1;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            RAISE NOTICE '🆕 Creating new batch for barangay: %', order_barangay;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight, status)
            VALUES (order_barangay, NEW.total_weight, max_weight_capacity, 'pending')
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE '✅ Created new batch % for barangay % (order weight: %kg)', 
                current_batch_id, order_barangay, NEW.total_weight;
        ELSE
            RAISE NOTICE '📦 Adding to existing batch % (current weight: %kg)', 
                current_batch_id, batch_total_weight;
            
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE '✅ Added order % to existing batch % (total weight: %kg)', 
                NEW.id, current_batch_id, batch_total_weight + NEW.total_weight;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
        RAISE NOTICE '✅ Order % assigned to batch %', NEW.id, current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE NOTICE '❌ Error details: %', SQLSTATE;
        -- Don't re-raise the exception, just log it and continue
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;
