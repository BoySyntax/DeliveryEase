-- Create order_status table
CREATE TABLE IF NOT EXISTS order_status (
  status_code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  color TEXT
);

-- Insert default statuses
INSERT INTO order_status (status_code, label, description, color) VALUES
  ('pending', 'Pending', 'Order is awaiting processing', '#FCD34D'),
  ('verified', 'Verified', 'Order has been verified', '#60A5FA'),
  ('rejected', 'Rejected', 'Order has been rejected', '#F87171'),
  ('assigned', 'Assigned', 'Order has been assigned to a driver', '#93C5FD'),
  ('delivering', 'Delivering', 'Order is being delivered', '#818CF8'),
  ('delivered', 'Delivered', 'Order has been delivered', '#34D399'),
  ('out_for_delivery', 'Out for Delivery', 'Order is out for delivery', '#4ADE80')
ON CONFLICT (status_code) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    color = EXCLUDED.color;

-- Add foreign key to orders table
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_order_status;
ALTER TABLE orders ADD CONSTRAINT fk_order_status
  FOREIGN KEY (order_status_code) REFERENCES order_status(status_code); 