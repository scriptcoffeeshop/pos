do $$
begin
  create type public.pos_inventory_consumption_subject as enum ('product', 'option');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.inventory_consumption_rules (
  id uuid primary key default gen_random_uuid(),
  subject_type public.pos_inventory_consumption_subject not null,
  product_id uuid references public.products(id) on delete cascade,
  option_label text not null default '',
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(12, 3) not null check (quantity > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_consumption_rules_subject_check check (
    (subject_type = 'product' and product_id is not null and option_label = '')
    or
    (subject_type = 'option' and product_id is null and length(trim(option_label)) > 0)
  )
);

create index if not exists inventory_consumption_rules_item_idx
  on public.inventory_consumption_rules(item_id, is_active desc, sort_order);

create index if not exists inventory_consumption_rules_product_idx
  on public.inventory_consumption_rules(product_id, is_active desc, sort_order)
  where subject_type = 'product';

create index if not exists inventory_consumption_rules_option_idx
  on public.inventory_consumption_rules(option_label, is_active desc, sort_order)
  where subject_type = 'option';

create unique index if not exists inventory_consumption_rules_active_product_item_idx
  on public.inventory_consumption_rules(product_id, item_id)
  where is_active and subject_type = 'product';

create unique index if not exists inventory_consumption_rules_active_option_item_idx
  on public.inventory_consumption_rules(option_label, item_id)
  where is_active and subject_type = 'option';

drop trigger if exists set_inventory_consumption_rules_updated_at on public.inventory_consumption_rules;
create trigger set_inventory_consumption_rules_updated_at
before update on public.inventory_consumption_rules
for each row execute function public.set_updated_at();

alter table public.inventory_consumption_rules enable row level security;

create or replace function public.apply_inventory_consumption_for_line(
  p_order_id uuid,
  p_order_number text,
  p_product_id uuid,
  p_product_name text,
  p_options jsonb,
  p_quantity integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule record;
  v_consumed numeric(12, 3);
  v_after numeric(12, 3);
  v_count integer := 0;
begin
  if p_quantity <= 0 then
    return 0;
  end if;

  for v_rule in
    select
      rule.id,
      rule.subject_type,
      rule.option_label,
      rule.item_id,
      rule.quantity,
      item.stock_quantity
    from public.inventory_consumption_rules rule
    join public.inventory_items item on item.id = rule.item_id
    where rule.is_active
      and item.is_active
      and (
        (rule.subject_type = 'product' and rule.product_id = p_product_id)
        or (
          rule.subject_type = 'option'
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(p_options, '[]'::jsonb)) option_value(value)
            where option_value.value = rule.option_label
          )
        )
      )
    order by rule.subject_type, rule.sort_order, rule.id
    for update of item
  loop
    v_consumed := round(v_rule.quantity * p_quantity, 3);

    update public.inventory_items
    set stock_quantity = round(stock_quantity - v_consumed, 3)
    where id = v_rule.item_id
    returning stock_quantity into v_after;

    insert into public.inventory_records (
      item_id,
      action,
      quantity,
      quantity_delta,
      quantity_after,
      unit_cost,
      total_cost,
      note,
      station_id
    )
    values (
      v_rule.item_id,
      'consumption',
      v_consumed,
      -v_consumed,
      v_after,
      0,
      0,
      left(
        concat(
          '自動消耗 ',
          coalesce(nullif(p_order_number, ''), p_order_id::text),
          ' · ',
          coalesce(nullif(p_product_name, ''), '未命名商品'),
          case
            when v_rule.subject_type = 'option' then concat(' · ', v_rule.option_label)
            else ''
          end
        ),
        240
      ),
      'auto-consume'
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.apply_inventory_consumption_for_line(uuid, text, uuid, text, jsonb, integer)
  from public, anon, authenticated;

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
  v_print_paused boolean;
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
    v_print_paused := case when jsonb_typeof(v_line -> 'printPaused') = 'boolean' then (v_line ->> 'printPaused')::boolean else false end;

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

      if not v_print_paused and v_product.inventory_count is not null then
        if v_product.inventory_count < v_quantity then
          raise exception 'Insufficient inventory for %', v_product.name;
        end if;

        update public.products
        set inventory_count = inventory_count - v_quantity
        where id = v_product_id;
      end if;
    end if;

    if not v_print_paused then
      perform public.apply_inventory_consumption_for_line(
        v_order_id,
        p_order_number,
        v_product_id,
        coalesce(nullif(v_line ->> 'name', ''), '未命名商品'),
        coalesce(v_line -> 'options', '[]'::jsonb),
        v_quantity
      );
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      product_sku,
      name,
      unit_price,
      quantity,
      options,
      print_paused
    )
    values (
      v_order_id,
      v_product_id,
      coalesce(nullif(v_line ->> 'productSku', ''), 'manual'),
      coalesce(nullif(v_line ->> 'name', ''), '未命名商品'),
      coalesce((v_line ->> 'unitPrice')::integer, 0),
      v_quantity,
      coalesce(v_line -> 'options', '[]'::jsonb),
      v_print_paused
    );
  end loop;

  return v_order_id;
end;
$$;

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
  v_print_paused boolean;
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
    v_print_paused := case when jsonb_typeof(v_line -> 'printPaused') = 'boolean' then (v_line ->> 'printPaused')::boolean else false end;

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

      if not v_print_paused and v_product.inventory_count is not null then
        if v_product.inventory_count < v_quantity then
          raise exception 'Insufficient inventory for %', v_product.name;
        end if;

        update public.products
        set inventory_count = inventory_count - v_quantity
        where id = v_product_id;
      end if;
    end if;

    if not v_print_paused then
      perform public.apply_inventory_consumption_for_line(
        p_order_id,
        coalesce(nullif(v_order.order_number, ''), p_order_id::text),
        v_product_id,
        coalesce(nullif(v_line ->> 'name', ''), '未命名商品'),
        coalesce(v_line -> 'options', '[]'::jsonb),
        v_quantity
      );
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      product_sku,
      name,
      unit_price,
      quantity,
      options,
      print_paused
    )
    values (
      p_order_id,
      v_product_id,
      coalesce(nullif(v_line ->> 'productSku', ''), 'manual'),
      coalesce(nullif(v_line ->> 'name', ''), '未命名商品'),
      coalesce((v_line ->> 'unitPrice')::integer, 0),
      v_quantity,
      coalesce(v_line -> 'options', '[]'::jsonb),
      v_print_paused
    );
  end loop;

  return p_order_id;
end;
$$;

revoke execute on function public.create_pos_order(
  text,
  public.pos_order_source,
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

grant execute on function public.create_pos_order(
  text,
  public.pos_order_source,
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

drop trigger if exists emit_pos_realtime_inventory_consumption_rules_event on public.inventory_consumption_rules;
create trigger emit_pos_realtime_inventory_consumption_rules_event
after insert or update or delete on public.inventory_consumption_rules
for each row execute function public.emit_pos_realtime_event('inventory_management');
