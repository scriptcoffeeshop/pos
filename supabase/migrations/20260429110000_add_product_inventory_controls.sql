alter table public.products
  add column if not exists inventory_count integer check (inventory_count is null or inventory_count >= 0),
  add column if not exists low_stock_threshold integer check (low_stock_threshold is null or low_stock_threshold >= 0),
  add column if not exists sold_out_until timestamptz;

create index if not exists products_inventory_alert_idx
  on public.products(is_available, inventory_count, low_stock_threshold, sold_out_until, sort_order);
