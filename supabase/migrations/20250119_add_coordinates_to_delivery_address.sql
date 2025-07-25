-- Add GPS coordinates to delivery_address for existing orders
UPDATE "public"."orders" 
SET delivery_address = delivery_address || 
  (
    SELECT json_build_object(
      'latitude', a.latitude,
      'longitude', a.longitude
    )
    FROM "public"."addresses" a
    WHERE a.customer_id = orders.customer_id
      AND a.barangay = (delivery_address->>'barangay')
    ORDER BY a.created_at DESC
    LIMIT 1
  )
WHERE delivery_address IS NOT NULL 
  AND (delivery_address->>'latitude') IS NULL;

-- Create or replace function to ensure new orders include coordinates
CREATE OR REPLACE FUNCTION copy_address_with_coordinates(customer_id_param UUID, selected_address_id UUID)
RETURNS JSONB AS $$
DECLARE
  address_data JSONB;
BEGIN
  SELECT json_build_object(
    'full_name', a.full_name,
    'phone', a.phone,
    'region', a.region,
    'province', a.province,
    'city', a.city,
    'barangay', a.barangay,
    'street_address', a.street_address,
    'postal_code', a.postal_code,
    'latitude', a.latitude,
    'longitude', a.longitude
  )
  INTO address_data
  FROM "public"."addresses" a
  WHERE a.id = selected_address_id AND a.customer_id = customer_id_param;
  
  RETURN address_data;
END;
$$ LANGUAGE plpgsql;

-- Comment on the function
COMMENT ON FUNCTION copy_address_with_coordinates(UUID, UUID) IS 'Copies address data including GPS coordinates for order delivery_address field'; 