alter table public.orders
  add column if not exists draft_lines jsonb not null default '[]'::jsonb;

alter table public.orders
  drop constraint if exists orders_draft_lines_is_array;

alter table public.orders
  add constraint orders_draft_lines_is_array
  check (jsonb_typeof(draft_lines) = 'array');

create or replace function public.finalize_pos_order(
  p_order_id uuid,
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
  v_order public.orders%rowtype;
  v_existing_line_count integer;
  v_line jsonb;
  v_product_id uuid;
  v_product public.products%rowtype;
  v_quantity integer;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines are required';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.source <> 'counter' then
    raise exception 'Only counter orders can be finalized';
  end if;

  if v_order.status in ('served', 'failed', 'voided') then
    raise exception 'Completed or voided orders cannot be finalized';
  end if;

  select count(*)
  into v_existing_line_count
  from public.order_items
  where order_id = p_order_id;

  if v_existing_line_count > 0 then
    raise exception 'Order is already finalized';
  end if;

  update public.orders
  set service_mode = p_service_mode,
      customer_name = coalesce(nullif(trim(p_customer_name), ''), '現場客'),
      customer_phone = coalesce(trim(p_customer_phone), ''),
      delivery_address = case when p_service_mode = 'delivery' then coalesce(trim(p_delivery_address), '') else '' end,
      requested_fulfillment_at = p_requested_fulfillment_at,
      note = coalesce(trim(p_note), ''),
      subtotal = p_subtotal,
      payment_method = p_payment_method,
      payment_status = p_payment_status,
      status = 'new',
      draft_lines = '[]'::jsonb,
      updated_at = now()
  where id = p_order_id;

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
      p_order_id,
      v_product_id,
      coalesce(nullif(v_line ->> 'productSku', ''), 'manual'),
      coalesce(nullif(v_line ->> 'name', ''), '未命名商品'),
      coalesce((v_line ->> 'unitPrice')::integer, 0),
      v_quantity,
      coalesce(v_line -> 'options', '[]'::jsonb)
    );
  end loop;

  return p_order_id;
end;
$$;

revoke execute on function public.finalize_pos_order(
  uuid,
  public.pos_service_mode,
  text,
  text,
  text,
  timestamptz,
  text,
  integer,
  public.pos_payment_method,
  public.pos_payment_status,
  jsonb
) from public, anon, authenticated;

grant execute on function public.finalize_pos_order(
  uuid,
  public.pos_service_mode,
  text,
  text,
  text,
  timestamptz,
  text,
  integer,
  public.pos_payment_method,
  public.pos_payment_status,
  jsonb
) to service_role;
