-- Test script to check delivery address coordinates
-- Run this in your Supabase SQL editor

-- Check if addresses table has coordinates
SELECT 
  'addresses' as table_name,
  COUNT(*) as total_records,
  COUNT(latitude) as records_with_latitude,
  COUNT(longitude) as records_with_longitude,
  COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as records_with_both_coordinates
FROM addresses;

-- Check if orders have delivery_address with coordinates
SELECT 
  'orders' as table_name,
  COUNT(*) as total_orders,
  COUNT(delivery_address) as orders_with_delivery_address,
  COUNT(CASE WHEN delivery_address->>'latitude' IS NOT NULL THEN 1 END) as orders_with_latitude,
  COUNT(CASE WHEN delivery_address->>'longitude' IS NOT NULL THEN 1 END) as orders_with_longitude,
  COUNT(CASE WHEN delivery_address->>'latitude' IS NOT NULL AND delivery_address->>'longitude' IS NOT NULL THEN 1 END) as orders_with_both_coordinates
FROM orders;

-- Show sample delivery addresses
SELECT 
  id,
  delivery_address->>'full_name' as customer_name,
  delivery_address->>'street_address' as street_address,
  delivery_address->>'barangay' as barangay,
  delivery_address->>'latitude' as latitude,
  delivery_address->>'longitude' as longitude
FROM orders 
WHERE delivery_address IS NOT NULL
LIMIT 10;

-- Check if there are any orders with coordinates
SELECT 
  id,
  delivery_address->>'full_name' as customer_name,
  delivery_address->>'street_address' as street_address,
  delivery_address->>'latitude' as latitude,
  delivery_address->>'longitude' as longitude
FROM orders 
WHERE delivery_address->>'latitude' IS NOT NULL 
  AND delivery_address->>'longitude' IS NOT NULL
LIMIT 5; 