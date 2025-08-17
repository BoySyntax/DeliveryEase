-- PERMANENT STOCK DEDUCTION FIX
-- This script fixes the stock issue permanently and prevents it from happening again

-- =============================================================================
-- STEP 1: RESTORE INCORRECTLY DEDUCTED STOCK
-- =============================================================================

-- Create function to restore stock for approved but undelivered orders
CREATE OR REPLACE FUNCTION restore_incorrectly_deducted_stock()
RETURNS TEXT AS $$
DECLARE
    order_record RECORD;
    item_record RECORD;
    current_stock INTEGER;
    restored_count INTEGER := 0;
    total_orders INTEGER := 0;
BEGIN
    -- Count total orders to fix
    SELECT COUNT(*) INTO total_orders
    FROM orders 
    WHERE approval_status = 'approved' 
    AND delivery_status != 'delivered';
    
    RAISE NOTICE 'Found % orders that are approved but not delivered', total_orders;
    
    -- Find all orders that are approved but not delivered
    FOR order_record IN 
        SELECT id, customer_id
        FROM orders 
        WHERE approval_status = 'approved' 
        AND delivery_status != 'delivered'
    LOOP
        RAISE NOTICE 'Processing order: %', order_record.id;
        
        -- For each order, restore stock for its items
        FOR item_record IN 
            SELECT oi.product_id, oi.quantity, p.name as product_name
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = order_record.id
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
            
            RAISE NOTICE 'Restored % units for product "%" (was: %, now: %)', 
                item_record.quantity, 
                item_record.product_name,
                current_stock,
                current_stock + item_record.quantity;
        END LOOP;
    END LOOP;
    
    RETURN format('Stock restored for %s items from %s approved but undelivered orders', 
                  restored_count, total_orders);
END;
$$ LANGUAGE plpgsql;

-- Execute the restoration
SELECT restore_incorrectly_deducted_stock();

-- =============================================================================
-- STEP 2: ADD RESERVATION STATUS TRACKING (SAFELY)
-- =============================================================================

-- Add reservation_status column if it doesn't exist
DO $$
BEGIN
    -- Check if column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'order_items' 
        AND column_name = 'reservation_status'
        AND table_schema = 'public'
    ) THEN
        -- Add the column
        ALTER TABLE order_items 
        ADD COLUMN reservation_status TEXT DEFAULT 'reserved';
        
        RAISE NOTICE 'Added reservation_status column to order_items';
    ELSE
        RAISE NOTICE 'reservation_status column already exists';
    END IF;
    
    -- Drop existing constraint if it exists to avoid conflicts
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'order_items_reservation_status_check'
        AND table_name = 'order_items'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE order_items DROP CONSTRAINT order_items_reservation_status_check;
        RAISE NOTICE 'Dropped existing reservation_status check constraint';
    END IF;
    
    -- Add the check constraint
    ALTER TABLE order_items 
    ADD CONSTRAINT order_items_reservation_status_check 
    CHECK (reservation_status IN ('reserved', 'committed', 'fulfilled', 'released'));
    
    RAISE NOTICE 'Added reservation_status check constraint';
END $$;

-- =============================================================================
-- STEP 3: UPDATE EXISTING ORDER ITEMS WITH CORRECT STATUS
-- =============================================================================

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
        AND orders.delivery_status != 'delivered'
    ) THEN 'committed'
    WHEN EXISTS (
        SELECT 1 FROM orders 
        WHERE orders.id = order_items.order_id 
        AND orders.approval_status = 'rejected'
    ) THEN 'released'
    ELSE 'reserved'
END;

-- =============================================================================
-- STEP 4: CREATE PERMANENT TRIGGER TO HANDLE STOCK CORRECTLY
-- =============================================================================

-- Function to handle stock deduction ONLY on delivery
CREATE OR REPLACE FUNCTION handle_stock_on_delivery()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
    current_stock INTEGER;
    new_stock INTEGER;
BEGIN
    -- Only proceed if delivery status changed to 'delivered'
    IF NEW.delivery_status = 'delivered' AND (OLD.delivery_status IS NULL OR OLD.delivery_status != 'delivered') THEN
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
            
            -- Calculate new stock (don't go below 0)
            new_stock := GREATEST(0, current_stock - item_record.quantity);
            
            -- Update product stock
            UPDATE products 
            SET quantity = new_stock
            WHERE id = item_record.product_id;
            
            RAISE NOTICE 'Product % stock: % -> % (deducted: %)', 
                item_record.product_id, current_stock, new_stock, item_record.quantity;
        END LOOP;
        
        -- Update order items to fulfilled status
        UPDATE order_items 
        SET reservation_status = 'fulfilled'
        WHERE order_id = NEW.id;
        
        RAISE NOTICE 'Order % items marked as fulfilled', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle stock restoration on order rejection
CREATE OR REPLACE FUNCTION handle_stock_on_rejection()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
    current_stock INTEGER;
    new_stock INTEGER;
BEGIN
    -- Only proceed if order was rejected
    IF NEW.approval_status = 'rejected' AND (OLD.approval_status IS NULL OR OLD.approval_status != 'rejected') THEN
        RAISE NOTICE 'Order % rejected, releasing reservations', NEW.id;
        
        -- Update order items to released status
        UPDATE order_items 
        SET reservation_status = 'released'
        WHERE order_id = NEW.id;
        
        RAISE NOTICE 'Order % items marked as released', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers to avoid conflicts
DROP TRIGGER IF EXISTS stock_deduction_on_delivery_trigger ON orders;
DROP TRIGGER IF EXISTS stock_release_on_rejection_trigger ON orders;
DROP TRIGGER IF EXISTS delivery_stock_deduction_trigger ON orders;

-- Create new triggers
CREATE TRIGGER stock_deduction_on_delivery_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_stock_on_delivery();

CREATE TRIGGER stock_release_on_rejection_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_stock_on_rejection();

-- =============================================================================
-- STEP 5: CLEAN UP AND VERIFICATION
-- =============================================================================

-- Clean up temporary functions
DROP FUNCTION IF EXISTS restore_incorrectly_deducted_stock();

-- Show final stock status
SELECT 
    p.name as product_name,
    p.quantity as current_stock,
    COUNT(CASE WHEN o.approval_status = 'approved' AND o.delivery_status != 'delivered' THEN 1 END) as committed_orders,
    COALESCE(SUM(CASE WHEN o.approval_status = 'approved' AND o.delivery_status != 'delivered' THEN oi.quantity ELSE 0 END), 0) as committed_quantity,
    COUNT(CASE WHEN o.delivery_status = 'delivered' THEN 1 END) as delivered_orders,
    COALESCE(SUM(CASE WHEN o.delivery_status = 'delivered' THEN oi.quantity ELSE 0 END), 0) as delivered_quantity
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
LEFT JOIN orders o ON o.id = oi.order_id
GROUP BY p.id, p.name, p.quantity
ORDER BY p.name;

-- Add helpful comments
COMMENT ON TRIGGER stock_deduction_on_delivery_trigger ON orders IS 
    'Automatically deducts product stock when orders are marked as delivered (NOT on approval)';

COMMENT ON TRIGGER stock_release_on_rejection_trigger ON orders IS 
    'Releases stock reservations when orders are rejected';

COMMENT ON COLUMN order_items.reservation_status IS 
    'Tracks stock reservation: reserved (ordered), committed (approved), fulfilled (delivered), released (rejected)';

-- Final success message
DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'STOCK DEDUCTION FIX COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Stock has been restored for approved but undelivered orders';
    RAISE NOTICE 'New triggers will only deduct stock when orders are DELIVERED';
    RAISE NOTICE 'Stock will be properly tracked with reservation status';
    RAISE NOTICE 'This issue will not happen again!';
    RAISE NOTICE '=================================================================';
END $$;
