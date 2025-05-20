/*
  # Initial schema setup for DeliveryEase

  1. New Enums
    - `user_role` - Role enum with values 'admin', 'customer', 'driver'
    - `order_status` - Status enum with values 'pending', 'assigned', 'delivering', 'delivered'

  2. New Tables
    - `profiles` - User profiles with role assignment
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
CREATE POLICY "Authenticated users can upload payment proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proof' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view their own payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proof' AND
  (storage.foldername(name))[1] = 'receipts' AND
  auth.uid() IS NOT NULL
);