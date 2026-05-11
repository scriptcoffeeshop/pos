alter table public.order_items
  add column if not exists fulfilled_at timestamptz,
  add column if not exists fulfilled_by_station_id text not null default '';

create index if not exists order_items_fulfillment_order_idx
  on public.order_items(order_id, fulfilled_at);
