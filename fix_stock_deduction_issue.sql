-- Fix Stock Deduction Issue
-- This script restores stock for orders that were approved but not yet delivered
-- since stock should only be deducted when orders are delivered, not when approved

-- Create a function to restore stock for approved but not delivered orders
CREATE OR REPLACE FUNCTION restore_stock_for_pending_orders()
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    item_record RECORD;
    current_stock INTEGER;
    restored_count INTEGER := 0;
BEGIN
    -- Find all orders that are approved but not delivered
    FOR order_record IN 
        SELECT id 
        FROM orders 
        WHERE approval_status = 'approved' 
        AND delivery_status != 'delivered'
    LOOP
        -- For each order, restore stock for its items
        FOR item_record IN 
            SELECT product_id, quantity 
            FROM order_items 
            WHERE order_id = order_record.id
        LOOP
            -- Get current stock
            SELECT quantity INTO current_stock 
            FROM products 
            WHERE id = item_record.product_id;
            
            -- Restore the stock by adding back the ordered quantity
            UPDATE products 
            SET quantity = current_stock + item_record.quantity
            WHERE id = item_record.product_id;
            
            restored_count := restored_count + 1;
            
            RAISE NOTICE 'Restored % units for product % (order %)', 
                item_record.quantity, item_record.product_id, order_record.id;
        END LOOP;
    END LOOP;
    
    RETURN format('Stock restored for %s items from approved but undelivered orders', restored_count);
END;
$$ LANGUAGE plpgsql;

-- Execute the function to restore stock
SELECT restore_stock_for_pending_orders();

-- Add reservation_status column to order_items if it doesn't exist
DO $$
BEGIN
    -- Check if column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'order_items' 
        AND column_name = 'reservation_status'
    ) THEN
        -- Add the column
        ALTER TABLE order_items 
        ADD COLUMN reservation_status TEXT DEFAULT 'reserved';
        
        -- Add the check constraint
        ALTER TABLE order_items 
        ADD CONSTRAINT order_items_reservation_status_check 
        CHECK (reservation_status IN ('reserved', 'committed', 'fulfilled', 'released'));
    END IF;
END $$;

-- Update existing order items based on their order status
UPDATE order_items 
SET reservation_status = CASE 
    WHEN EXISTS (
        SELECT 1 FROM orders 
        WHERE orders.id = order_items.order_id 
        AND orders.delivery_status = 'delivered'
    ) THEN 'fulfilled'
    WHEN EXISTS (
        SELECT 1 FROM orders 
        WHERE orders.id = order_items.order_id 
        AND orders.approval_status = 'approved'
    ) THEN 'committed'
    WHEN EXISTS (
        SELECT 1 FROM orders 
        WHERE orders.id = order_items.order_id 
        AND orders.approval_status = 'rejected'
    ) THEN 'released'
    ELSE 'reserved'
END
WHERE reservation_status IS NULL OR reservation_status = 'reserved';

-- Create a function to properly handle stock deduction only on delivery
CREATE OR REPLACE FUNCTION handle_delivery_stock_deduction()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
    current_stock INTEGER;
BEGIN
    -- Only proceed if delivery status changed to 'delivered'
    IF NEW.delivery_status = 'delivered' AND OLD.delivery_status != 'delivered' THEN
        RAISE NOTICE 'Order % marked as delivered, deducting stock', NEW.id;
        
        -- Deduct stock for each item in the order
        FOR item_record IN 
            SELECT product_id, quantity 
            FROM order_items 
            WHERE order_id = NEW.id
        LOOP
            -- Get current stock
            SELECT quantity INTO current_stock 
            FROM products 
            WHERE id = item_record.product_id;
            
            -- Deduct stock (don't go below 0)
            UPDATE products 
            SET quantity = GREATEST(0, current_stock - item_record.quantity)
            WHERE id = item_record.product_id;
            
            RAISE NOTICE 'Deducted % units for product % (current stock was %)', 
                item_record.quantity, item_record.product_id, current_stock;
        END LOOP;
        
        -- Update order items to fulfilled status
        UPDATE order_items 
        SET reservation_status = 'fulfilled'
        WHERE order_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic stock deduction on delivery
DROP TRIGGER IF EXISTS delivery_stock_deduction_trigger ON orders;
CREATE TRIGGER delivery_stock_deduction_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_delivery_stock_deduction();

-- Drop the cleanup function as it's no longer needed
DROP FUNCTION IF EXISTS restore_stock_for_pending_orders();

COMMENT ON TRIGGER delivery_stock_deduction_trigger ON orders IS 
    'Automatically deducts product stock when orders are marked as delivered';
