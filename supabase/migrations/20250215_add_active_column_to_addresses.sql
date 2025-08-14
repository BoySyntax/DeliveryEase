-- Add active column to addresses table for soft delete functionality
-- This allows us to hide addresses that have been "deleted" by users
-- while preserving them for order history and foreign key integrity

ALTER TABLE public.addresses 
ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- Add index for performance when filtering active addresses
CREATE INDEX IF NOT EXISTS idx_addresses_active ON public.addresses(active, customer_id);

-- Add comment explaining the column
COMMENT ON COLUMN public.addresses.active IS 'Whether this address is active/visible to the user. Set to false for soft delete.';

-- Update existing addresses to be active by default
UPDATE public.addresses SET active = true WHERE active IS NULL;

-- Create a view for active addresses only (optional, for convenience)
CREATE OR REPLACE VIEW public.active_addresses AS
SELECT * FROM public.addresses WHERE active = true;

-- Grant appropriate permissions
GRANT SELECT ON public.active_addresses TO authenticated;
GRANT ALL ON public.active_addresses TO service_role;
