do $$
begin
  create type public.pos_inventory_record_action as enum ('purchase', 'return', 'consumption', 'scrapped', 'count');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.inventory_categories(id) on delete restrict,
  name text not null,
  unit text not null default '份',
  default_unit_cost integer not null default 0 check (default_unit_cost >= 0),
  stock_quantity numeric(12, 3) not null default 0,
  low_stock_quantity numeric(12, 3) check (low_stock_quantity is null or low_stock_quantity >= 0),
  note text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_records (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  action public.pos_inventory_record_action not null,
  quantity numeric(12, 3) not null default 0,
  quantity_delta numeric(12, 3) not null default 0,
  quantity_after numeric(12, 3) not null default 0,
  unit_cost integer not null default 0 check (unit_cost >= 0),
  total_cost integer not null default 0,
  note text not null default '',
  station_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists inventory_categories_sort_idx
  on public.inventory_categories(is_active desc, sort_order, name);

create index if not exists inventory_items_category_sort_idx
  on public.inventory_items(category_id, is_active desc, sort_order, name);

create index if not exists inventory_items_low_stock_idx
  on public.inventory_items(is_active, stock_quantity, low_stock_quantity)
  where low_stock_quantity is not null;

create index if not exists inventory_records_item_created_idx
  on public.inventory_records(item_id, created_at desc);

drop trigger if exists set_inventory_categories_updated_at on public.inventory_categories;
create trigger set_inventory_categories_updated_at
before update on public.inventory_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

alter table public.inventory_categories enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_records enable row level security;

create or replace function public.apply_inventory_record(
  p_item_id uuid,
  p_action public.pos_inventory_record_action,
  p_quantity numeric default null,
  p_unit_cost integer default null,
  p_total_cost integer default null,
  p_counted_quantity numeric default null,
  p_note text default '',
  p_station_id text default ''
)
returns public.inventory_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.inventory_items%rowtype;
  v_record public.inventory_records%rowtype;
  v_current numeric(12, 3);
  v_quantity numeric(12, 3) := round(coalesce(p_quantity, 0), 3);
  v_counted numeric(12, 3) := round(coalesce(p_counted_quantity, 0), 3);
  v_delta numeric(12, 3);
  v_after numeric(12, 3);
  v_unit_cost integer := greatest(coalesce(p_unit_cost, 0), 0);
  v_total_cost integer := coalesce(p_total_cost, 0);
begin
  select *
  into v_item
  from public.inventory_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Inventory item not found';
  end if;

  v_current := round(coalesce(v_item.stock_quantity, 0), 3);

  if p_action = 'count' then
    if p_counted_quantity is null then
      raise exception 'countedQuantity is required';
    end if;
    v_quantity := v_counted;
    v_delta := round(v_counted - v_current, 3);
    v_after := v_counted;
    v_unit_cost := 0;
    v_total_cost := 0;
  else
    if v_quantity <= 0 then
      raise exception 'quantity must be greater than 0';
    end if;

    if p_action = 'purchase' then
      v_delta := v_quantity;
      v_total_cost := greatest(v_total_cost, round(v_unit_cost * v_quantity)::integer);
    elsif p_action = 'return' then
      v_delta := -v_quantity;
      v_total_cost := -greatest(v_total_cost, round(v_unit_cost * v_quantity)::integer);
    elsif p_action in ('consumption', 'scrapped') then
      v_delta := -v_quantity;
      v_unit_cost := 0;
      v_total_cost := 0;
    else
      raise exception 'Unsupported inventory action';
    end if;

    v_after := round(v_current + v_delta, 3);
  end if;

  update public.inventory_items
  set stock_quantity = v_after
  where id = p_item_id;

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
    p_item_id,
    p_action,
    v_quantity,
    v_delta,
    v_after,
    v_unit_cost,
    v_total_cost,
    coalesce(left(p_note, 240), ''),
    coalesce(left(p_station_id, 80), '')
  )
  returning * into v_record;

  return v_record;
end;
$$;

revoke execute on function public.apply_inventory_record(uuid, public.pos_inventory_record_action, numeric, integer, integer, numeric, text, text) from public;
revoke execute on function public.apply_inventory_record(uuid, public.pos_inventory_record_action, numeric, integer, integer, numeric, text, text) from anon;
revoke execute on function public.apply_inventory_record(uuid, public.pos_inventory_record_action, numeric, integer, integer, numeric, text, text) from authenticated;

alter table public.pos_realtime_events
  drop constraint if exists pos_realtime_events_topic_check;

alter table public.pos_realtime_events
  add constraint pos_realtime_events_topic_check
  check (topic in ('orders', 'runtime_settings', 'register_sessions', 'products', 'online_order_reminders', 'cash_drawer', 'inventory_management'));

create or replace function public.emit_pos_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_topic text := tg_argv[0];
  v_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_entity_id text := coalesce(v_data ->> 'id', v_data ->> 'key', '');
  v_payload jsonb := '{}'::jsonb;
begin
  if v_topic = 'runtime_settings' then
    v_entity_id := coalesce(v_data ->> 'key', '');
    if v_entity_id not in ('printer_settings', 'online_ordering', 'pos_appearance', 'floor_plan', 'engagement_settings') then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
    v_payload := jsonb_build_object('key', v_entity_id);
  elsif v_topic = 'orders' then
    v_payload := jsonb_build_object(
      'orderNumber', v_data ->> 'order_number',
      'source', v_data ->> 'source',
      'status', v_data ->> 'status',
      'paymentStatus', v_data ->> 'payment_status',
      'claimedBy', coalesce(v_data ->> 'claimed_by', ''),
      'claimExpiresAt', coalesce(v_data ->> 'claim_expires_at', '')
    );
  elsif v_topic = 'register_sessions' then
    v_payload := jsonb_build_object(
      'status', v_data ->> 'status',
      'openedAt', v_data ->> 'opened_at',
      'closedAt', coalesce(v_data ->> 'closed_at', '')
    );
  elsif v_topic = 'products' then
    v_payload := jsonb_build_object(
      'sku', v_data ->> 'sku',
      'category', v_data ->> 'category',
      'isAvailable', coalesce(v_data ->> 'is_available', ''),
      'sortOrder', coalesce(v_data ->> 'sort_order', '')
    );
  elsif v_topic = 'online_order_reminders' then
    v_entity_id := coalesce(v_data ->> 'order_number', v_data ->> 'order_id', '');
    v_payload := jsonb_build_object(
      'orderNumber', v_data ->> 'order_number',
      'status', v_data ->> 'status',
      'snoozedUntil', coalesce(v_data ->> 'snoozed_until', ''),
      'seenAt', coalesce(v_data ->> 'seen_at', ''),
      'lastAction', coalesce(v_data ->> 'last_action', '')
    );
  elsif v_topic = 'inventory_management' then
    v_payload := jsonb_build_object(
      'sourceTable', tg_table_name,
      'name', coalesce(v_data ->> 'name', ''),
      'itemId', coalesce(v_data ->> 'item_id', v_data ->> 'id', ''),
      'action', coalesce(v_data ->> 'action', ''),
      'quantityAfter', coalesce(v_data ->> 'quantity_after', v_data ->> 'stock_quantity', '')
    );
  end if;

  insert into public.pos_realtime_events (
    topic,
    event_name,
    source_table,
    entity_id,
    payload
  )
  values (
    v_topic,
    tg_op,
    tg_table_name,
    v_entity_id,
    v_payload
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.emit_pos_realtime_event() from public;
revoke execute on function public.emit_pos_realtime_event() from anon;
revoke execute on function public.emit_pos_realtime_event() from authenticated;

drop trigger if exists emit_pos_realtime_inventory_categories_event on public.inventory_categories;
create trigger emit_pos_realtime_inventory_categories_event
after insert or update or delete on public.inventory_categories
for each row execute function public.emit_pos_realtime_event('inventory_management');

drop trigger if exists emit_pos_realtime_inventory_items_event on public.inventory_items;
create trigger emit_pos_realtime_inventory_items_event
after insert or update or delete on public.inventory_items
for each row execute function public.emit_pos_realtime_event('inventory_management');

drop trigger if exists emit_pos_realtime_inventory_records_event on public.inventory_records;
create trigger emit_pos_realtime_inventory_records_event
after insert or update or delete on public.inventory_records
for each row execute function public.emit_pos_realtime_event('inventory_management');
