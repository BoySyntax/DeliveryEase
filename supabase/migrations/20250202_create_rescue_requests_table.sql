-- Create rescue_requests table for driver emergency requests
CREATE TABLE IF NOT EXISTS rescue_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  driver_name TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_rescue_requests_driver_id ON rescue_requests(driver_id);
CREATE INDEX idx_rescue_requests_status ON rescue_requests(status);
CREATE INDEX idx_rescue_requests_requested_at ON rescue_requests(requested_at);

-- Enable RLS
ALTER TABLE rescue_requests ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Drivers can view their own rescue requests"
  ON rescue_requests FOR SELECT
  USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert their own rescue requests"
  ON rescue_requests FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Admins can view all rescue requests"
  ON rescue_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update rescue requests"
  ON rescue_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Add comment
COMMENT ON TABLE rescue_requests IS 'Stores driver emergency rescue requests with location data';
COMMENT ON COLUMN rescue_requests.latitude IS 'Driver latitude at time of request';
COMMENT ON COLUMN rescue_requests.longitude IS 'Driver longitude at time of request';
COMMENT ON COLUMN rescue_requests.address IS 'Human-readable address from reverse geocoding';
COMMENT ON COLUMN rescue_requests.status IS 'Current status of the rescue request';
COMMENT ON COLUMN rescue_requests.acknowledged_by IS 'Admin who acknowledged the request';



