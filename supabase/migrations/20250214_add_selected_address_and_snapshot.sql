-- Add selected_address_id to orders and permanently snapshot delivery_address

-- 1) Add column with FK
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS selected_address_id uuid REFERENCES public.addresses(id);

COMMENT ON COLUMN public.orders.selected_address_id IS 'The exact address the customer selected at checkout.';

-- 2) Create function to snapshot delivery_address from selected_address_id on insert
CREATE OR REPLACE FUNCTION public.snapshot_delivery_address()
RETURNS trigger AS $$
DECLARE
  addr RECORD;
BEGIN
  -- When inserting a new order, if selected_address_id is provided, snapshot the address JSON
  IF TG_OP = 'INSERT' THEN
    IF NEW.selected_address_id IS NOT NULL THEN
      SELECT * INTO addr
      FROM public.addresses a
      WHERE a.id = NEW.selected_address_id
      LIMIT 1;

      IF addr IS NULL THEN
        RAISE EXCEPTION 'Selected address (%) not found', NEW.selected_address_id;
      END IF;

      -- Optional guard: ensure the address belongs to the same customer
      IF NEW.customer_id IS NOT NULL AND addr.customer_id <> NEW.customer_id THEN
        RAISE EXCEPTION 'Selected address does not belong to customer';
      END IF;

      NEW.delivery_address := jsonb_build_object(
        'full_name', addr.full_name,
        'phone', addr.phone,
        'street_address', addr.street_address,
        'barangay', addr.barangay,
        'latitude', addr.latitude,
        'longitude', addr.longitude
      );
    ELSIF NEW.delivery_address IS NULL THEN
      -- Fallback: choose the most recent address at or before order creation
      SELECT * INTO addr
      FROM public.addresses a
      WHERE a.customer_id = NEW.customer_id
      ORDER BY a.created_at DESC
      LIMIT 1;

      IF addr IS NOT NULL THEN
        NEW.selected_address_id := addr.id;
        NEW.delivery_address := jsonb_build_object(
          'full_name', addr.full_name,
          'phone', addr.phone,
          'street_address', addr.street_address,
          'barangay', addr.barangay,
          'latitude', addr.latitude,
          'longitude', addr.longitude
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Prevent accidental overwrites of delivery_address after insert
CREATE OR REPLACE FUNCTION public.prevent_delivery_address_overwrite()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- If someone tries to change delivery_address without changing selected_address_id, block it
    IF NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
       AND (NEW.selected_address_id IS NOT DISTINCT FROM OLD.selected_address_id) THEN
      NEW.delivery_address := OLD.delivery_address;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) Attach triggers
DROP TRIGGER IF EXISTS snapshot_delivery_address_on_insert ON public.orders;
CREATE TRIGGER snapshot_delivery_address_on_insert
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_delivery_address();

DROP TRIGGER IF EXISTS prevent_delivery_address_overwrite_on_update ON public.orders;
CREATE TRIGGER prevent_delivery_address_overwrite_on_update
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_delivery_address_overwrite();

-- 5) Backfill historical orders: pick address that existed at order time; fallback to oldest
WITH chosen AS (
  SELECT 
    o.id AS order_id,
    a1.id AS address_id,
    a1.full_name,
    a1.phone,
    a1.street_address,
    a1.barangay,
    a1.latitude,
    a1.longitude
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT a.*
    FROM public.addresses a
    WHERE a.customer_id = o.customer_id
      AND a.created_at <= COALESCE(o.created_at, now())
    ORDER BY a.created_at DESC
    LIMIT 1
  ) a1 ON TRUE
)
UPDATE public.orders o
SET selected_address_id = COALESCE(o.selected_address_id, c.address_id),
    delivery_address = jsonb_build_object(
      'full_name', c.full_name,
      'phone', c.phone,
      'street_address', c.street_address,
      'barangay', c.barangay,
      'latitude', c.latitude,
      'longitude', c.longitude
    )
FROM chosen c
WHERE o.id = c.order_id
  AND c.address_id IS NOT NULL
  AND (
    o.delivery_address IS NULL
    OR (o.delivery_address->>'barangay') IS DISTINCT FROM c.barangay
  );

-- 6) Helpful comment
COMMENT ON FUNCTION public.snapshot_delivery_address IS 'On INSERT, snapshot the selected address into orders.delivery_address and set selected_address_id.';
COMMENT ON FUNCTION public.prevent_delivery_address_overwrite IS 'Prevents orders.delivery_address from being overwritten without changing selected_address_id.';


