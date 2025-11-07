-- Auto-update batch status to 'delivered' when all orders in a batch are delivered
-- This ensures batches are automatically marked as completed when all orders are finished

-- Function to check and update batch status when orders are updated
CREATE OR REPLACE FUNCTION auto_update_batch_status_on_completion()
RETURNS TRIGGER AS $$
DECLARE
    batch_id_to_check uuid;
    all_orders_delivered boolean;
    total_orders integer;
    delivered_orders integer;
BEGIN
    -- Get the batch_id from the updated order
    batch_id_to_check := COALESCE(NEW.batch_id, OLD.batch_id);
    
    -- Only proceed if the order has a batch_id
    IF batch_id_to_check IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Check if all orders in this batch are delivered
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE delivery_status = 'delivered') as delivered
    INTO total_orders, delivered_orders
    FROM orders 
    WHERE batch_id = batch_id_to_check 
    AND approval_status = 'approved';
    
    -- If all orders are delivered, update batch status
    all_orders_delivered := (total_orders > 0 AND delivered_orders = total_orders);
    
    IF all_orders_delivered THEN
        -- Update the batch status to delivered
        UPDATE order_batches 
        SET status = 'delivered'
        WHERE id = batch_id_to_check 
        AND status != 'delivered';
        
        RAISE NOTICE 'Auto-updated batch % to delivered status (all % orders completed)', 
                    batch_id_to_check, total_orders;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger on orders table to auto-update batch status
DROP TRIGGER IF EXISTS auto_update_batch_status_trigger ON orders;
CREATE TRIGGER auto_update_batch_status_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION auto_update_batch_status_on_completion();

-- Also create trigger for INSERT in case orders are added with delivered status
DROP TRIGGER IF EXISTS auto_update_batch_status_insert_trigger ON orders;
CREATE TRIGGER auto_update_batch_status_insert_trigger
    AFTER INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION auto_update_batch_status_on_completion();













