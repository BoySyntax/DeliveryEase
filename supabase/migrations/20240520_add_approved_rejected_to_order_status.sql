-- Add 'approved' and 'rejected' to the order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'rejected'; 