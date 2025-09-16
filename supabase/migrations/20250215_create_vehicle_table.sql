-- Create Vehicle table
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL UNIQUE, -- UNIQUE constraint for one-to-one relationship
    plate_number VARCHAR(8) NOT NULL UNIQUE, -- Vehicle Identification (Philippine Standard)
    vehicle_type VARCHAR(50) NOT NULL, -- Vehicle Details
    brand VARCHAR(100),
    model VARCHAR(100),
    year INTEGER,
    capacity_kg INTEGER, -- Capacity & Specifications
    fuel_type VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT true, -- Status & Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Foreign key constraint
    CONSTRAINT fk_vehicles_driver 
        FOREIGN KEY (driver_id) 
        REFERENCES profiles(id) 
        ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_number ON vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_type ON vehicles(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_active ON vehicles(is_active);

-- Enable RLS (Row Level Security)
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Drivers can view and manage their own vehicles
CREATE POLICY "Drivers can view their own vehicles" ON vehicles
    FOR SELECT USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert their own vehicles" ON vehicles
    FOR INSERT WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can update their own vehicles" ON vehicles
    FOR UPDATE USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can delete their own vehicles" ON vehicles
    FOR DELETE USING (auth.uid() = driver_id);

-- Admins can view all vehicles
CREATE POLICY "Admins can view all vehicles" ON vehicles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_vehicles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW
    EXECUTE FUNCTION update_vehicles_updated_at();

-- Add comments for documentation
COMMENT ON TABLE vehicles IS 'Stores comprehensive vehicle information for delivery drivers';
COMMENT ON COLUMN vehicles.id IS 'Primary key for vehicle records';
COMMENT ON COLUMN vehicles.driver_id IS 'Foreign key referencing the driver profile (one-to-one relationship)';
COMMENT ON COLUMN vehicles.plate_number IS 'Vehicle license plate number (Philippine standard, max 8 characters)';
COMMENT ON COLUMN vehicles.vehicle_type IS 'Type of vehicle (motorcycle, tricycle, pickup, van, truck)';
COMMENT ON COLUMN vehicles.brand IS 'Vehicle brand (Toyota, Ford, Honda, etc.)';
COMMENT ON COLUMN vehicles.model IS 'Vehicle model (Hilux, Ranger, Wave, etc.)';
COMMENT ON COLUMN vehicles.year IS 'Manufacturing year';
COMMENT ON COLUMN vehicles.capacity_kg IS 'Maximum cargo capacity in kilograms';
COMMENT ON COLUMN vehicles.fuel_type IS 'Type of fuel (gasoline, diesel, electric)';
COMMENT ON COLUMN vehicles.is_active IS 'Whether the vehicle is currently active for deliveries';
