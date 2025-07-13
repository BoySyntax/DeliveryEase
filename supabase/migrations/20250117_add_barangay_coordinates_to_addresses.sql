-- Add missing columns to addresses table for Region 10 barangay system
-- This adds barangay selection and GPS coordinates storage

-- Add barangay column to store the selected barangay
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS barangay text;

-- Add GPS coordinates columns for precise delivery location
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS latitude decimal(10,8);
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS longitude decimal(11,8);

-- Add index on barangay for efficient filtering and batching
CREATE INDEX IF NOT EXISTS idx_addresses_barangay ON addresses(barangay);

-- Add index on coordinates for potential geographic queries
CREATE INDEX IF NOT EXISTS idx_addresses_coordinates ON addresses(latitude, longitude);

-- Update existing addresses with extracted barangay info where possible
-- This attempts to extract barangay from existing street_address data
UPDATE addresses SET barangay = 
  CASE 
    WHEN street_address ILIKE '%cagayan de oro%' OR street_address ILIKE '%cdo%' THEN 'Unknown Barangay, Cagayan de Oro'
    WHEN street_address ILIKE '%misamis%' THEN 'Unknown Barangay, Misamis Oriental'
    WHEN street_address ILIKE '%iligan%' THEN 'Unknown Barangay, Iligan'
    WHEN street_address ILIKE '%malaybalay%' THEN 'Unknown Barangay, Malaybalay'
    WHEN street_address ILIKE '%valencia%' THEN 'Unknown Barangay, Valencia'
    WHEN street_address ILIKE '%oroquieta%' THEN 'Unknown Barangay, Oroquieta'
    ELSE 'Legacy Address - Please Update'
  END
WHERE barangay IS NULL;

-- Add comment explaining the barangay system
COMMENT ON COLUMN addresses.barangay IS 'Selected barangay for delivery batch assignment - determines which delivery batch this address belongs to';
COMMENT ON COLUMN addresses.latitude IS 'GPS latitude for precise delivery location from map selection';
COMMENT ON COLUMN addresses.longitude IS 'GPS longitude for precise delivery location from map selection';

-- Log completion
SELECT 'Added barangay and coordinates columns to addresses table' as status; 