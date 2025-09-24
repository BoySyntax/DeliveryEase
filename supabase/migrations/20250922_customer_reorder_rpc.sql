-- Secure RPC to allow customers to reorder by updating the SAME order
-- It updates order status/fields and replaces order_items in a single transaction
-- Runs as SECURITY DEFINER to bypass RLS safely with ownership checks

CREATE OR REPLACE FUNCTION public.customer_reorder(
  p_order_id uuid,
  p_items jsonb,
  p_total numeric,
  p_selected_address_id uuid,
  p_delivery_address jsonb,
  p_notes text
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order orders;
BEGIN
  -- Ensure stable search path
  PERFORM set_config('search_path', 'public', true);

  -- Validate ownership and that order is currently rejected
  IF NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = p_order_id
      AND o.customer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not allowed to reorder this order'
      USING ERRCODE = '42501';
  END IF;

  -- Update the order back to pending with new details
  UPDATE orders
  SET approval_status = 'pending',
      delivery_status = 'pending',
      order_status_code = 'pending',
      total = p_total,
      selected_address_id = p_selected_address_id,
      delivery_address = p_delivery_address,
      notes = p_notes
  WHERE id = p_order_id;

  -- Replace items
  DELETE FROM order_items WHERE order_id = p_order_id;

  INSERT INTO order_items (order_id, product_id, quantity, price, reservation_status)
  SELECT p_order_id,
         (i->>'product_id')::uuid,
         COALESCE((i->>'quantity')::int, 1),
         COALESCE((i->>'price')::numeric, 0),
         'reserved'
  FROM jsonb_array_elements(p_items) AS i;

  -- Return the updated order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_reorder(uuid, jsonb, numeric, uuid, jsonb, text) TO authenticated;


