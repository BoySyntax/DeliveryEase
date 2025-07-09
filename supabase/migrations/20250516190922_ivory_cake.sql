/*
  # Initial schema setup for DeliveryEase

  1. New Enums
    - `user_role` - Role enum with values 'admin', 'customer', 'driver'
    - `order_status` - Status enum with values 'pending', 'assigned', 'delivering', 'delivered'

  2. New Tables
    - `profiles` - User profiles with role assignment
    - `addresses` - User addresses
    - `categories` - Product categories
    - `products` - Products available for purchase
    - `carts` - Shopping carts for customers
    - `cart_items` - Items in shopping carts
    - `orders` - Customer orders
    - `order_items` - Items in orders
    - `payment_proofs` - Payment proof uploads

  3. Security
    - Enable RLS on all tables
    - Define policies for each table based on user roles
*/

-- Create types
CREATE TYPE user_role AS ENUM ('admin', 'customer', 'driver');
CREATE TYPE order_status AS ENUM ('pending', 'assigned', 'delivering', 'delivered');

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name TEXT,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'customer'
);

-- Create addresses table
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  region TEXT NOT NULL,
  province TEXT NOT NULL,
  city TEXT NOT NULL,
  barangay TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  street_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  weight DECIMAL(10, 2) NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create carts table
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create cart_items table
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INT NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status order_status NOT NULL DEFAULT 'pending',
  total DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  price DECIMAL(10, 2) NOT NULL
);

-- Create payment_proofs table
CREATE TABLE IF NOT EXISTS payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;

-- Create security policies

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Addresses policies
CREATE POLICY "Users can view their own addresses"
  ON addresses FOR SELECT
  TO authenticated
  USING (auth.uid() = customer_id);

CREATE POLICY "Users can insert their own addresses"
  ON addresses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Users can update their own addresses"
  ON addresses FOR UPDATE
  TO authenticated
  USING (auth.uid() = customer_id);

CREATE POLICY "Users can delete their own addresses"
  ON addresses FOR DELETE
  TO authenticated
  USING (auth.uid() = customer_id);

-- Categories policies
CREATE POLICY "Categories are viewable by everyone"
  ON categories FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Only admins can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Only admins can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Products policies
CREATE POLICY "Products are viewable by everyone"
  ON products FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Only admins can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Only admins can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Carts policies
CREATE POLICY "Customers can view their own carts"
  ON carts FOR SELECT
  TO authenticated
  USING (auth.uid() = customer_id);

CREATE POLICY "Customers can insert their own carts"
  ON carts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update their own carts"
  ON carts FOR UPDATE
  TO authenticated
  USING (auth.uid() = customer_id);

CREATE POLICY "Customers can delete their own carts"
  ON carts FOR DELETE
  TO authenticated
  USING (auth.uid() = customer_id);

-- Cart_items policies
CREATE POLICY "Customers can view items in their own carts"
  ON cart_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_id AND carts.customer_id = auth.uid()
  ));

CREATE POLICY "Customers can insert items to their own carts"
  ON cart_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_id AND carts.customer_id = auth.uid()
  ));

CREATE POLICY "Customers can update items in their own carts"
  ON cart_items FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_id AND carts.customer_id = auth.uid()
  ));

CREATE POLICY "Customers can delete items from their own carts"
  ON cart_items FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_id AND carts.customer_id = auth.uid()
  ));

-- Orders policies
CREATE POLICY "Customers can view their own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (auth.uid() = customer_id);

CREATE POLICY "Drivers can view orders assigned to them"
  ON orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = driver_id OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Customers can create their own orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Only admins can assign drivers"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    (auth.uid() = driver_id AND status = 'assigned') OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Order_items policies
CREATE POLICY "Users can view items in their allowed orders"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_id AND (
        orders.customer_id = auth.uid() OR
        orders.driver_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Customers can insert items to their orders"
  ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_id AND orders.customer_id = auth.uid()
    )
  );

-- Payment_proofs policies
CREATE POLICY "Users can view payment proofs for their allowed orders"
  ON payment_proofs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_id AND (
        orders.customer_id = auth.uid() OR
        orders.driver_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Customers can upload payment proofs for their orders"
  ON payment_proofs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_id AND orders.customer_id = auth.uid()
    )
  );

-- Storage bucket policies for payment-proof
DROP POLICY IF EXISTS "Authenticated users can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Customers can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view payment proofs" ON storage.objects;

-- Allow customers to upload payment proofs for their orders
CREATE POLICY "Customers can upload payment proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proof' AND
  auth.role() = 'authenticated' AND
  (storage.foldername(name))[1] = 'receipts' AND
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = REPLACE((storage.foldername(name))[2], 'order-', '')
    AND orders.customer_id = auth.uid()
  )
);

-- Allow viewing payment proofs for authorized users
CREATE POLICY "Authorized users can view payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proof' AND
  (storage.foldername(name))[1] = 'receipts' AND
  (
    -- Customer who owns the order
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = REPLACE((storage.foldername(name))[2], 'order-', '')
      AND orders.customer_id = auth.uid()
    )
    OR
    -- Driver assigned to the order
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = REPLACE((storage.foldername(name))[2], 'order-', '')
      AND orders.driver_id = auth.uid()
    )
    OR
    -- Admin
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
);

-- Create order_batches table
CREATE TABLE IF NOT EXISTS order_batches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    status text NOT NULL DEFAULT 'pending',
    driver_id uuid,
    barangay text NOT NULL,
    total_weight decimal NOT NULL DEFAULT 0,
    max_weight decimal NOT NULL DEFAULT 3500,
    CONSTRAINT order_batches_status_check CHECK (status IN ('pending', 'assigned', 'delivering', 'delivered'))
);

-- Add foreign key to orders table for batch_id
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES order_batches(id),
ADD COLUMN IF NOT EXISTS total_weight decimal DEFAULT 0,
ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS delivery_address jsonb,
ADD COLUMN IF NOT EXISTS notification_read boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_dismissed boolean DEFAULT false;

-- Create view for order batches with driver info
CREATE OR REPLACE VIEW order_batches_with_drivers AS
SELECT 
    b.*,
    p.id as driver_profile_id,
    p.name as driver_name
FROM order_batches b
LEFT JOIN profiles p ON b.driver_id = p.id;

-- Grant access to the view
GRANT SELECT ON order_batches_with_drivers TO authenticated;

-- Update RLS policies for order_batches
ALTER TABLE order_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admins full access to order_batches"
ON order_batches
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

CREATE POLICY "Allow authenticated users to view order_batches"
ON order_batches
FOR SELECT
TO authenticated
USING (true);

-- Add constraints to orders
ALTER TABLE orders 
DROP CONSTRAINT IF EXISTS orders_approval_status_check,
ADD CONSTRAINT orders_approval_status_check 
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
DROP CONSTRAINT IF EXISTS orders_delivery_status_check,
ADD CONSTRAINT orders_delivery_status_check 
    CHECK (delivery_status IN ('pending', 'in_progress', 'delivered'));

-- Create function to update order total weight
CREATE OR REPLACE FUNCTION update_order_total_weight()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the order's total weight when items are added/modified
    UPDATE orders
    SET total_weight = (
        SELECT COALESCE(SUM(oi.quantity * p.weight), 0)
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = NEW.order_id
    )
    WHERE id = NEW.order_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically batch approved orders
CREATE OR REPLACE FUNCTION batch_approved_orders()
RETURNS TRIGGER AS $$
DECLARE
    order_barangay text;
    current_batch_id uuid;
    batch_total_weight decimal;
    calculated_weight decimal;
BEGIN
    -- Only proceed if the order was just approved
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Log the delivery_address for debugging
        RAISE NOTICE 'Processing order % with delivery_address: %', NEW.id, NEW.delivery_address;
        
        -- Get the order's barangay from delivery_address
        order_barangay := NEW.delivery_address->>'barangay';
        
        RAISE NOTICE 'Extracted barangay: %', order_barangay;
        
        IF order_barangay IS NULL OR order_barangay = '' THEN
            RAISE EXCEPTION 'No barangay found in delivery address for order %. Delivery address: %', NEW.id, NEW.delivery_address;
        END IF;

        -- Calculate order weight if not set
        IF NEW.total_weight IS NULL OR NEW.total_weight <= 0 THEN
            SELECT COALESCE(SUM(oi.quantity * p.weight), 1)
            INTO calculated_weight
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = NEW.id;
            
            NEW.total_weight := calculated_weight;
            RAISE NOTICE 'Calculated weight for order %: %', NEW.id, calculated_weight;
        END IF;

        -- Find an existing batch that:
        -- 1. Is pending (not assigned to driver yet)
        -- 2. Has orders from the same barangay
        -- 3. Has enough remaining capacity
        -- 4. Prioritize the batch with the most remaining space (but still under max capacity)
        SELECT b.id, b.total_weight 
        INTO current_batch_id, batch_total_weight
        FROM order_batches b
        WHERE b.status = 'pending'
        AND b.barangay = order_barangay
        AND b.total_weight + NEW.total_weight <= b.max_weight
        ORDER BY (b.max_weight - b.total_weight) DESC, b.created_at ASC
        LIMIT 1;

        RAISE NOTICE 'Found existing batch: %, total_weight: %', current_batch_id, batch_total_weight;

        -- If no suitable batch found, create a new one
        IF current_batch_id IS NULL THEN
            RAISE NOTICE 'Creating new batch for barangay: %, weight: %', order_barangay, NEW.total_weight;
            
            INSERT INTO order_batches (barangay, total_weight, max_weight)
            VALUES (order_barangay, NEW.total_weight, 3500)
            RETURNING id INTO current_batch_id;
            
            RAISE NOTICE 'Created new batch with id: %', current_batch_id;
        ELSE
            -- Update existing batch's total weight
            UPDATE order_batches 
            SET total_weight = batch_total_weight + NEW.total_weight
            WHERE id = current_batch_id;
            
            RAISE NOTICE 'Updated batch % with new total weight: %', current_batch_id, batch_total_weight + NEW.total_weight;
        END IF;

        -- Update the order with the batch_id
        NEW.batch_id := current_batch_id;
        RAISE NOTICE 'Assigned order % to batch %', NEW.id, current_batch_id;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in batch_approved_orders for order %: %', NEW.id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS update_order_weight_trigger ON order_items;
CREATE TRIGGER update_order_weight_trigger
    AFTER INSERT OR UPDATE ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_order_total_weight();

DROP TRIGGER IF EXISTS batch_orders_trigger ON orders;
CREATE TRIGGER batch_orders_trigger
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION batch_approved_orders();

-- Function to optimize and consolidate batches for better space utilization
CREATE OR REPLACE FUNCTION optimize_batches_for_barangay(target_barangay text DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    batch_record RECORD;
    source_batch RECORD;
    target_batch RECORD;
    merged_count INTEGER := 0;
    barangay_filter text := target_barangay;
BEGIN
    -- If no specific barangay provided, optimize all
    IF barangay_filter IS NULL THEN
        -- Get all barangays with multiple pending batches
        FOR batch_record IN 
            SELECT barangay 
            FROM order_batches 
            WHERE status = 'pending' 
            GROUP BY barangay 
            HAVING COUNT(*) > 1
        LOOP
            barangay_filter := batch_record.barangay;
            
            -- Consolidate batches for this barangay
            WHILE EXISTS (
                SELECT 1 FROM order_batches 
                WHERE status = 'pending' 
                AND barangay = barangay_filter 
                GROUP BY barangay 
                HAVING COUNT(*) > 1
            ) LOOP
                -- Find two batches that can be merged (smallest total weight first)
                SELECT INTO source_batch, target_batch 
                    b1.*, b2.*
                FROM order_batches b1, order_batches b2
                WHERE b1.status = 'pending' 
                AND b2.status = 'pending'
                AND b1.barangay = barangay_filter
                AND b2.barangay = barangay_filter
                AND b1.id != b2.id
                AND b1.total_weight + b2.total_weight <= LEAST(b1.max_weight, b2.max_weight)
                ORDER BY b1.total_weight + b2.total_weight ASC
                LIMIT 1;
                
                -- If we found batches to merge
                IF source_batch.id IS NOT NULL AND target_batch.id IS NOT NULL THEN
                    -- Choose the target batch (keep the one with more capacity)
                    IF source_batch.max_weight - source_batch.total_weight > target_batch.max_weight - target_batch.total_weight THEN
                        -- Use source_batch as target
                        UPDATE orders SET batch_id = source_batch.id WHERE batch_id = target_batch.id;
                        UPDATE order_batches SET total_weight = source_batch.total_weight + target_batch.total_weight WHERE id = source_batch.id;
                        DELETE FROM order_batches WHERE id = target_batch.id;
                    ELSE
                        -- Use target_batch as target
                        UPDATE orders SET batch_id = target_batch.id WHERE batch_id = source_batch.id;
                        UPDATE order_batches SET total_weight = source_batch.total_weight + target_batch.total_weight WHERE id = target_batch.id;
                        DELETE FROM order_batches WHERE id = source_batch.id;
                    END IF;
                    
                    merged_count := merged_count + 1;
                ELSE
                    -- No more batches can be merged for this barangay
                    EXIT;
                END IF;
            END LOOP;
        END LOOP;
    ELSE
        -- Optimize specific barangay
        WHILE EXISTS (
            SELECT 1 FROM order_batches 
            WHERE status = 'pending' 
            AND barangay = barangay_filter 
            GROUP BY barangay 
            HAVING COUNT(*) > 1
        ) LOOP
            -- Find two batches that can be merged
            SELECT INTO source_batch, target_batch 
                b1.*, b2.*
            FROM order_batches b1, order_batches b2
            WHERE b1.status = 'pending' 
            AND b2.status = 'pending'
            AND b1.barangay = barangay_filter
            AND b2.barangay = barangay_filter
            AND b1.id != b2.id
            AND b1.total_weight + b2.total_weight <= LEAST(b1.max_weight, b2.max_weight)
            ORDER BY b1.total_weight + b2.total_weight ASC
            LIMIT 1;
            
            -- If we found batches to merge
            IF source_batch.id IS NOT NULL AND target_batch.id IS NOT NULL THEN
                -- Choose the target batch (keep the one with more capacity)
                IF source_batch.max_weight - source_batch.total_weight > target_batch.max_weight - target_batch.total_weight THEN
                    -- Use source_batch as target
                    UPDATE orders SET batch_id = source_batch.id WHERE batch_id = target_batch.id;
                    UPDATE order_batches SET total_weight = source_batch.total_weight + target_batch.total_weight WHERE id = source_batch.id;
                    DELETE FROM order_batches WHERE id = target_batch.id;
                ELSE
                    -- Use target_batch as target
                    UPDATE orders SET batch_id = target_batch.id WHERE batch_id = source_batch.id;
                    UPDATE order_batches SET total_weight = source_batch.total_weight + target_batch.total_weight WHERE id = target_batch.id;
                    DELETE FROM order_batches WHERE id = source_batch.id;
                END IF;
                
                merged_count := merged_count + 1;
            ELSE
                -- No more batches can be merged
                EXIT;
            END IF;
        END LOOP;
    END IF;
    
    IF merged_count > 0 THEN
        RETURN format('Successfully merged %s batch pairs', merged_count);
    ELSE
        RETURN 'No batches could be merged';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_orders_approval_status ON orders(approval_status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_addresses_customer_id_created ON addresses(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_batches_status ON order_batches(status);
CREATE INDEX IF NOT EXISTS idx_order_batches_driver_id ON order_batches(driver_id);