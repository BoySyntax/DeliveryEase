-- Performance optimization indexes
-- These indexes will significantly improve query performance

-- Orders table indexes
CREATE INDEX IF NOT EXISTS idx_orders_customer_id_created_at 
ON orders (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_approval_status 
ON orders (approval_status);

CREATE INDEX IF NOT EXISTS idx_orders_delivery_status 
ON orders (delivery_status);

CREATE INDEX IF NOT EXISTS idx_orders_batch_id 
ON orders (batch_id) WHERE batch_id IS NOT NULL;

-- Order items indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
ON order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id 
ON order_items (product_id);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_category_id_active 
ON products (category_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_name_search 
ON products USING gin(to_tsvector('english', name));

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_active 
ON categories (is_active) WHERE is_active = true;

-- Cart indexes
CREATE INDEX IF NOT EXISTS idx_carts_customer_id_created_at 
ON carts (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id 
ON cart_items (cart_id);

-- Order batches indexes
CREATE INDEX IF NOT EXISTS idx_order_batches_status_created_at 
ON order_batches (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_batches_driver_id_status 
ON order_batches (driver_id, status) WHERE driver_id IS NOT NULL;

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role 
ON profiles (role);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_orders_customer_approval_created 
ON orders (customer_id, approval_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_batch_approval 
ON orders (batch_id, approval_status) WHERE batch_id IS NOT NULL;

-- Partial indexes for better performance
CREATE INDEX IF NOT EXISTS idx_orders_pending_approval 
ON orders (created_at DESC) WHERE approval_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_orders_approved_not_delivered 
ON orders (batch_id, created_at) 
WHERE approval_status = 'approved' AND delivery_status != 'delivered';

-- Statistics update
ANALYZE orders;
ANALYZE order_items;
ANALYZE products;
ANALYZE categories;
ANALYZE carts;
ANALYZE cart_items;
ANALYZE order_batches;
ANALYZE profiles;
