-- Add original_order_id field to track reorders
ALTER TABLE orders ADD COLUMN original_order_id UUID REFERENCES orders(id);

-- Add index for better performance
CREATE INDEX idx_orders_original_order_id ON orders(original_order_id);

-- Add comment
COMMENT ON COLUMN orders.original_order_id IS 'References the original order ID when this is a reorder';








