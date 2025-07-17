-- Function to update order delivery_status when batch is assigned
CREATE OR REPLACE FUNCTION update_order_delivery_status_on_batch_assignment()
RETURNS TRIGGER AS $$
BEGIN
    -- When a batch is assigned to a driver (status changes from 'pending' to 'assigned')
    IF NEW.status = 'assigned' AND OLD.status = 'pending' AND NEW.driver_id IS NOT NULL THEN
        -- Update all orders in this batch to have delivery_status = 'assigned'
        UPDATE orders 
        SET delivery_status = 'assigned'
        WHERE batch_id = NEW.id;
        
        RAISE NOTICE 'Updated delivery_status to assigned for all orders in batch %', NEW.id;
    END IF;
    
    -- When a batch starts delivering (status changes from 'assigned' to 'delivering')
    IF NEW.status = 'delivering' AND OLD.status = 'assigned' THEN
        -- Update all orders in this batch to have delivery_status = 'delivering'
        UPDATE orders 
        SET delivery_status = 'delivering'
        WHERE batch_id = NEW.id;
        
        RAISE NOTICE 'Updated delivery_status to delivering for all orders in batch %', NEW.id;
    END IF;
    
    -- When a batch is completed (status changes to 'delivered')
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
        -- Update all orders in this batch to have delivery_status = 'delivered'
        UPDATE orders 
        SET delivery_status = 'delivered'
        WHERE batch_id = NEW.id;
        
        RAISE NOTICE 'Updated delivery_status to delivered for all orders in batch %', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on order_batches table
DROP TRIGGER IF EXISTS update_order_delivery_status_trigger ON order_batches;
CREATE TRIGGER update_order_delivery_status_trigger
    AFTER UPDATE ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_order_delivery_status_on_batch_assignment(); 