-- Add a new delivery_status column to the orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status order_status DEFAULT 'pending'; 