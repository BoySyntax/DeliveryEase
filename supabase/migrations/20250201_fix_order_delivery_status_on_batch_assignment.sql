-- First fix the constraint to allow 'delivering' status
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
ALTER TABLE orders 
ADD CONSTRAINT orders_delivery_status_check 
    CHECK (delivery_status IN ('pending', 'assigned', 'delivering', 'delivered'));

-- Function to update orders delivery_status when batch is assigned to driver
CREATE OR REPLACE FUNCTION update_orders_on_batch_assignment()
RETURNS TRIGGER AS $$
BEGIN
    -- When batch is assigned to driver, update driver_id but keep status as assigned
    -- The notification will fire when driver clicks "Start Delivery" 
    IF NEW.status = 'assigned' AND OLD.status = 'pending' AND NEW.driver_id IS NOT NULL THEN
        UPDATE orders 
        SET 
            delivery_status = 'assigned',
            driver_id = NEW.driver_id
        WHERE batch_id = NEW.id;
        
        RAISE NOTICE 'Updated % orders to assigned status for batch %', 
                    (SELECT COUNT(*) FROM orders WHERE batch_id = NEW.id), NEW.id;
    END IF;
    
    -- When batch is marked as delivering, ensure orders are also delivering
    IF NEW.status = 'delivering' AND OLD.status = 'assigned' THEN
        UPDATE orders 
        SET delivery_status = 'delivering'
        WHERE batch_id = NEW.id;
        
        RAISE NOTICE 'Updated % orders to delivering status for batch %', 
                    (SELECT COUNT(*) FROM orders WHERE batch_id = NEW.id), NEW.id;
    END IF;
    
    -- When batch is delivered, update all orders to delivered
    IF NEW.status = 'delivered' AND OLD.status IN ('assigned', 'delivering') THEN
        UPDATE orders 
        SET delivery_status = 'delivered'
        WHERE batch_id = NEW.id;
        
        RAISE NOTICE 'Updated % orders to delivered status for batch %', 
                    (SELECT COUNT(*) FROM orders WHERE batch_id = NEW.id), NEW.id;
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error updating orders for batch %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on order_batches table
DROP TRIGGER IF EXISTS update_orders_on_batch_status_change ON order_batches;
CREATE TRIGGER update_orders_on_batch_status_change
    AFTER UPDATE ON order_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_orders_on_batch_assignment();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_orders_on_batch_assignment() TO authenticated;
GRANT EXECUTE ON FUNCTION update_orders_on_batch_assignment() TO service_role;

-- Fix existing orders that should already be in delivering status
-- Update orders that are in batches assigned to drivers but still have pending delivery_status
UPDATE orders 
SET 
    delivery_status = 'delivering',
    driver_id = COALESCE(orders.driver_id, ob.driver_id)
FROM order_batches ob
WHERE orders.batch_id = ob.id 
AND ob.status IN ('assigned', 'delivering')
AND ob.driver_id IS NOT NULL
AND orders.delivery_status = 'pending'
AND orders.approval_status = 'approved';

-- Log the results
DO $$
DECLARE
    affected_orders INTEGER;
BEGIN
    SELECT COUNT(*) INTO affected_orders
    FROM orders o
    JOIN order_batches ob ON o.batch_id = ob.id
    WHERE o.approval_status = 'approved'
    AND o.delivery_status = 'delivering'
    AND ob.status IN ('assigned', 'delivering')
    AND ob.driver_id IS NOT NULL;
    
    RAISE NOTICE 'Total orders now in delivering status: %', affected_orders;
END $$;
