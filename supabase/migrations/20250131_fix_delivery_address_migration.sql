-- Fix delivery address migration issue
-- This migration corrects the problem where the previous migration overwrote
-- delivery addresses with the newest address instead of preserving the selected one

-- First, let's log what we're fixing
DO $$
DECLARE
    affected_orders_count INTEGER;
BEGIN
    -- Count orders that might have been affected
    SELECT COUNT(*) INTO affected_orders_count
    FROM orders 
    WHERE delivery_address IS NOT NULL 
    AND delivery_address->>'barangay' IS NOT NULL;
    
    RAISE NOTICE 'Found % orders with delivery addresses that may need verification', affected_orders_count;
END $$;

-- Create a function to help identify and fix problematic orders
CREATE OR REPLACE FUNCTION fix_delivery_address_discrepancies()
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    customer_addresses RECORD;
    fixed_count INTEGER := 0;
    total_count INTEGER := 0;
BEGIN
    -- Loop through all orders with delivery addresses
    FOR order_record IN 
        SELECT o.id, o.customer_id, o.delivery_address, o.created_at
        FROM orders o
        WHERE o.delivery_address IS NOT NULL
        AND o.delivery_address->>'barangay' IS NOT NULL
        ORDER BY o.created_at DESC
    LOOP
        total_count := total_count + 1;
        
        -- Get the customer's addresses at the time the order was created
        -- We'll use the address that was most recently created BEFORE the order
        SELECT a.* INTO customer_addresses
        FROM addresses a
        WHERE a.customer_id = order_record.customer_id
        AND a.created_at <= order_record.created_at
        ORDER BY a.created_at DESC
        LIMIT 1;
        
        -- If we found an address and it's different from what's in the order
        IF customer_addresses.id IS NOT NULL THEN
            -- Check if the barangay is different
            IF customer_addresses.barangay != (order_record.delivery_address->>'barangay') THEN
                RAISE NOTICE 'Order %: Fixing barangay from % to %', 
                    order_record.id, 
                    order_record.delivery_address->>'barangay', 
                    customer_addresses.barangay;
                
                -- Update the order with the correct address
                UPDATE orders 
                SET delivery_address = jsonb_build_object(
                    'full_name', customer_addresses.full_name,
                    'phone', customer_addresses.phone,
                    'street_address', customer_addresses.street_address,
                    'barangay', customer_addresses.barangay,
                    'city', COALESCE(customer_addresses.city, 'Unknown'),
                    'province', COALESCE(customer_addresses.province, 'Unknown'),
                    'region', COALESCE(customer_addresses.region, 'Unknown'),
                    'postal_code', COALESCE(customer_addresses.postal_code, '0000'),
                    'latitude', customer_addresses.latitude,
                    'longitude', customer_addresses.longitude
                )
                WHERE id = order_record.id;
                
                fixed_count := fixed_count + 1;
            END IF;
        END IF;
    END LOOP;
    
    RETURN format('Fixed %s out of %s orders with delivery address discrepancies', fixed_count, total_count);
END;
$$ LANGUAGE plpgsql;

-- Create a function to manually check and fix a specific order
CREATE OR REPLACE FUNCTION fix_specific_order_delivery_address(order_id_to_fix UUID)
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    customer_addresses RECORD;
    result_text TEXT;
BEGIN
    -- Get the order details
    SELECT o.id, o.customer_id, o.delivery_address, o.created_at
    INTO order_record
    FROM orders o
    WHERE o.id = order_id_to_fix;
    
    IF order_record.id IS NULL THEN
        RETURN format('Order %s not found', order_id_to_fix);
    END IF;
    
    -- Get the customer's addresses at the time the order was created
    SELECT a.* INTO customer_addresses
    FROM addresses a
    WHERE a.customer_id = order_record.customer_id
    AND a.created_at <= order_record.created_at
    ORDER BY a.created_at DESC
    LIMIT 1;
    
    IF customer_addresses.id IS NULL THEN
        RETURN format('No addresses found for customer %s at order creation time', order_record.customer_id);
    END IF;
    
    -- Check if the barangay is different
    IF customer_addresses.barangay != (order_record.delivery_address->>'barangay') THEN
        RAISE NOTICE 'Order %: Fixing barangay from % to %', 
            order_record.id, 
            order_record.delivery_address->>'barangay', 
            customer_addresses.barangay;
        
        -- Update the order with the correct address
        UPDATE orders 
        SET delivery_address = jsonb_build_object(
            'full_name', customer_addresses.full_name,
            'phone', customer_addresses.phone,
            'street_address', customer_addresses.street_address,
            'barangay', customer_addresses.barangay,
            'city', COALESCE(customer_addresses.city, 'Unknown'),
            'province', COALESCE(customer_addresses.province, 'Unknown'),
            'region', COALESCE(customer_addresses.region, 'Unknown'),
            'postal_code', COALESCE(customer_addresses.postal_code, '0000'),
            'latitude', customer_addresses.latitude,
            'longitude', customer_addresses.longitude
        )
        WHERE id = order_record.id;
        
        result_text := format('Fixed order %s: barangay changed from %s to %s', 
            order_record.id, 
            order_record.delivery_address->>'barangay', 
            customer_addresses.barangay);
    ELSE
        result_text := format('Order %s already has correct barangay: %s', 
            order_record.id, 
            order_record.delivery_address->>'barangay');
    END IF;
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- Execute the fix for all orders
SELECT fix_delivery_address_discrepancies();

-- Clean up the functions
DROP FUNCTION fix_delivery_address_discrepancies();
DROP FUNCTION fix_specific_order_delivery_address(UUID);

-- Add a comment to prevent this issue from happening again
COMMENT ON COLUMN orders.delivery_address IS 'Stores the delivery address details for the order. DO NOT OVERWRITE with customer profile addresses - this should preserve the address selected during checkout.';
