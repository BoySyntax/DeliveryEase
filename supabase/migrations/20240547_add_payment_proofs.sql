-- Add payment_proof_url to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS payment_proof_url text; 