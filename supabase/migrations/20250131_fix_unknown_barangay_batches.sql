-- Fix existing batches that have "Unknown" barangay by extracting from order addresses
-- This will update existing batches to have the correct barangay

CREATE OR REPLACE FUNCTION fix_unknown_barangay_batches()
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    order_record RECORD;
    extracted_barangay text;
    full_address text;
    address_parts text[];
    last_comma_pos int;
    last_part text;
    fixed_count INTEGER := 0;
BEGIN
    -- Find batches with "Unknown" or "Unknown Location" barangay
    FOR batch_record IN 
        SELECT id, barangay
        FROM order_batches 
        WHERE status IN ('pending', 'ready_for_delivery')
        AND (barangay = 'Unknown' OR barangay = 'Unknown Location' OR barangay IS NULL)
    LOOP
        RAISE NOTICE '🔧 Fixing batch % with barangay: %', batch_record.id, batch_record.barangay;
        
        -- Get the first order in this batch to extract barangay
        SELECT o.delivery_address
        INTO order_record
        FROM orders o
        WHERE o.batch_id = batch_record.id
        LIMIT 1;
        
        IF order_record.delivery_address IS NOT NULL THEN
            -- Try to extract barangay from the delivery address
            extracted_barangay := order_record.delivery_address->>'barangay';
            
            -- If not found in barangay field, try full address
            IF extracted_barangay IS NULL OR extracted_barangay = '' OR extracted_barangay = 'null' THEN
                full_address := COALESCE(order_record.delivery_address->>'address', '');
                RAISE NOTICE '📍 Full address for batch %: %', batch_record.id, full_address;
                
                -- Split address by comma and look for barangay patterns
                address_parts := string_to_array(full_address, ',');
                
                -- Look for barangay in the address parts
                FOR i IN 1..array_length(address_parts, 1) LOOP
                    DECLARE
                        part text;
                    BEGIN
                        part := trim(address_parts[i]);
                        
                        -- Check if this part looks like a barangay
                        IF part ILIKE '%barangay%' OR part ILIKE '%brgy%' OR 
                           (part ILIKE '%misamis%' AND part ILIKE '%oriental%') OR
                           (length(part) > 3 AND part NOT ILIKE '%city%' AND part NOT ILIKE '%philippines%') THEN
                            extracted_barangay := part;
                            RAISE NOTICE '📍 Found barangay in address part: %', extracted_barangay;
                            EXIT;
                        END IF;
                    END;
                END LOOP;
            END IF;
            
            -- If still not found, try last part of address
            IF extracted_barangay IS NULL OR extracted_barangay = '' OR extracted_barangay = 'null' THEN
                last_comma_pos := position(',' in reverse(full_address));
                
                IF last_comma_pos > 0 THEN
                    last_part := trim(substring(full_address from length(full_address) - last_comma_pos + 2));
                    last_part := replace(last_part, 'Philippines', '');
                    last_part := trim(last_part);
                    
                    IF last_part != '' AND last_part NOT ILIKE '%city%' THEN
                        extracted_barangay := last_part;
                        RAISE NOTICE '📍 Extracted barangay from last part: %', extracted_barangay;
                    END IF;
                END IF;
            END IF;
            
            -- Update the batch with the extracted barangay
            IF extracted_barangay IS NOT NULL AND extracted_barangay != '' AND extracted_barangay != 'null' THEN
                UPDATE order_batches 
                SET barangay = extracted_barangay
                WHERE id = batch_record.id;
                
                fixed_count := fixed_count + 1;
                RAISE NOTICE '✅ Fixed batch % barangay: % -> %', 
                    batch_record.id, batch_record.barangay, extracted_barangay;
            ELSE
                RAISE NOTICE '❌ Could not extract barangay for batch %', batch_record.id;
            END IF;
        ELSE
            RAISE NOTICE '❌ No delivery address found for batch %', batch_record.id;
        END IF;
    END LOOP;
    
    IF fixed_count > 0 THEN
        RETURN format('Fixed %s batches with unknown barangay', fixed_count);
    ELSE
        RETURN 'No batches with unknown barangay found';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Run the fix function
SELECT fix_unknown_barangay_batches();






