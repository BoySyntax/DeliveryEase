-- Simple Stock Deduction Fix
-- This script restores stock for orders that were approved but not yet delivered
-- since stock should only be deducted when orders are delivered, not when approved

-- Create a temporary function to restore stock for pending orders
CREATE OR REPLACE FUNCTION restore_stock_for_approved_orders()
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

-- Execute the function to restore stock
SELECT restore_stock_for_approved_orders();

-- Clean up the temporary function
DROP FUNCTION restore_stock_for_approved_orders();

-- Show current stock levels after restoration
SELECT 
    p.name as product_name,
    p.quantity as current_stock,
    COUNT(oi.id) as pending_orders,
    COALESCE(SUM(oi.quantity), 0) as total_pending_quantity
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
LEFT JOIN orders o ON o.id = oi.order_id 
    AND o.approval_status = 'approved' 
    AND o.delivery_status != 'delivered'
GROUP BY p.id, p.name, p.quantity
ORDER BY p.name;




















