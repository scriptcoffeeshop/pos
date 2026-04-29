alter table public.orders
  add column if not exists delivery_address text not null default '',
  add column if not exists requested_fulfillment_at timestamptz;

drop function if exists public.create_pos_order(
  text,
  public.pos_order_source,
  public.pos_service_mode,
  text,
  text,
  text,
  integer,
  public.pos_payment_method,
  public.pos_payment_status,
  jsonb
);

create or replace function public.create_pos_order(
  p_order_number text,
  p_source public.pos_order_source,
  p_service_mode public.pos_service_mode,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_requested_fulfillment_at timestamptz,
  p_note text,
  p_subtotal integer,
  p_payment_method public.pos_payment_method,
  p_payment_status public.pos_payment_status,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_line jsonb;
  v_product_id uuid;
  v_product public.products%rowtype;
  v_quantity integer;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines are required';
  end if;

  insert into public.orders (
    order_number,
    source,
    service_mode,
    customer_name,
    customer_phone,
    delivery_address,
    requested_fulfillment_at,
    note,
    subtotal,
    payment_method,
    payment_status,
    status
  )
  values (
    p_order_number,
    p_source,
    p_service_mode,
    coalesce(nullif(trim(p_customer_name), ''), '現場客'),
    coalesce(trim(p_customer_phone), ''),
    case when p_service_mode = 'delivery' then coalesce(trim(p_delivery_address), '') else '' end,
    p_requested_fulfillment_at,
    coalesce(trim(p_note), ''),
    p_subtotal,
    p_payment_method,
    p_payment_status,
    'new'
  )
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product_id := nullif(v_line ->> 'productId', '')::uuid;
    v_quantity := coalesce((v_line ->> 'quantity')::integer, 0);

    if v_quantity <= 0 then
      raise exception 'line quantity must be positive';
    end if;

    if v_product_id is not null then
      select *
      into v_product
      from public.products
      where id = v_product_id
      for update;

      if not found then
        raise exception 'Product not found';
      end if;

      if v_product.inventory_count is not null then
        if v_product.inventory_count < v_quantity then
          raise exception 'Insufficient inventory for %', v_product.name;
        end if;

        update public.products
        set inventory_count = inventory_count - v_quantity
        where id = v_product_id;
      end if;
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      product_sku,
      name,
      unit_price,
      quantity,
      options
    )
    values (
      v_order_id,
      v_product_id,
      coalesce(nullif(v_line ->> 'productSku', ''), 'manual'),
      coalesce(nullif(v_line ->> 'name', ''), '未命名商品'),
      coalesce((v_line ->> 'unitPrice')::integer, 0),
      v_quantity,
      coalesce(v_line -> 'options', '[]'::jsonb)
    );
  end loop;

  return v_order_id;
end;
$$;
