-- EMERGENCY FIX: Run this immediately in Supabase SQL Editor
-- This will temporarily disable the problematic trigger

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;

-- Create a minimal trigger function that won't fail
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
BEGIN
    -- Just return the new order without any batching logic for now
    -- This prevents the max_weight column error
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger with the safe function
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders(); 