-- First, copy existing status to order_status_code
UPDATE orders
SET order_status_code = CASE
  WHEN approval_status = 'rejected' THEN 'rejected'
  WHEN approval_status = 'approved' THEN 'verified'
  WHEN delivery_status = 'assigned' THEN 'assigned'
  WHEN delivery_status = 'delivering' THEN 'delivering'
  WHEN delivery_status = 'delivered' THEN 'delivered'
  ELSE 'pending'
END;

-- Drop the delivery_status and approval_status columns
ALTER TABLE orders DROP COLUMN IF EXISTS delivery_status;
ALTER TABLE orders DROP COLUMN IF EXISTS approval_status;

-- Add foreign key constraint
ALTER TABLE orders
  ADD CONSTRAINT fk_order_status
  FOREIGN KEY (order_status_code)
  REFERENCES order_status(status_code);

-- Drop the auth_users_view if it exists
DROP VIEW IF EXISTS auth_users_view; 