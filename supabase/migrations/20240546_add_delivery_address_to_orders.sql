alter table "public"."orders" add column "delivery_address" jsonb;

comment on column "public"."orders"."delivery_address" is 'Stores the delivery address details for the order';

-- Update existing orders with delivery addresses from customer profiles
update "public"."orders" o
set delivery_address = (
  select json_build_object(
    'region', a.region,
    'province', a.province,
    'city', a.city,
    'barangay', a.barangay,
    'street_address', a.street_address,
    'postal_code', a.postal_code
  )
  from "public"."addresses" a
  where a.customer_id = o.customer_id
  order by a.created_at desc
  limit 1
)
where o.delivery_address is null; 