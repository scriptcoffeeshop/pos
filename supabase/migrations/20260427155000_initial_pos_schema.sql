create extension if not exists pgcrypto;

do $$
begin
  create type public.pos_menu_category as enum ('coffee', 'tea', 'food', 'retail');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.pos_order_source as enum ('counter', 'qr', 'online');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.pos_service_mode as enum ('dine-in', 'takeout', 'delivery');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.pos_payment_method as enum ('cash', 'card', 'line-pay', 'jkopay', 'transfer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.pos_payment_status as enum ('pending', 'authorized', 'paid', 'expired', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.pos_order_status as enum ('new', 'preparing', 'ready', 'served', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.pos_print_status as enum ('queued', 'printed', 'skipped', 'failed');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category public.pos_menu_category not null,
  price integer not null check (price >= 0),
  tags text[] not null default '{}',
  accent text not null default '#0f766e',
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique,
  line_display_name text not null,
  wallet_balance integer not null default 0 check (wallet_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  source public.pos_order_source not null default 'counter',
  service_mode public.pos_service_mode not null default 'takeout',
  member_id uuid references public.members(id) on delete set null,
  customer_name text not null default '現場客',
  customer_phone text not null default '',
  note text not null default '',
  subtotal integer not null default 0 check (subtotal >= 0),
  payment_method public.pos_payment_method not null default 'cash',
  payment_status public.pos_payment_status not null default 'pending',
  status public.pos_order_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_sku text not null,
  name text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  options jsonb not null default '[]'::jsonb,
  line_total integer generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_ledger (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  entry_type text not null check (entry_type in ('top_up', 'payment', 'refund', 'adjustment')),
  amount integer not null check (amount <> 0),
  balance_after integer,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  station_name text not null default 'GODEX DT2X',
  printer_host text not null default '192.168.1.100',
  printer_port integer not null default 9100 check (printer_port > 0 and printer_port <= 65535),
  protocol text not null default 'EZPL over TCP',
  payload text not null,
  status public.pos_print_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  printed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_category_available_idx on public.products(category, is_available, sort_order);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status, created_at desc);
create index if not exists orders_payment_status_idx on public.orders(payment_status, created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists transaction_ledger_member_id_idx on public.transaction_ledger(member_id, created_at desc);
create index if not exists print_jobs_order_id_idx on public.print_jobs(order_id);
create index if not exists print_jobs_status_idx on public.print_jobs(status, created_at asc);

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_members_updated_at on public.members;
create trigger set_members_updated_at
before update on public.members
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists set_print_jobs_updated_at on public.print_jobs;
create trigger set_print_jobs_updated_at
before update on public.print_jobs
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.members enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.transaction_ledger enable row level security;
alter table public.print_jobs enable row level security;

drop policy if exists "Public can read available products" on public.products;
create policy "Public can read available products"
on public.products
for select
to anon, authenticated
using (is_available = true);

insert into public.products (sku, name, category, price, tags, accent, sort_order)
values
  ('americano-ice', '冰美式', 'coffee', 95, array['冰', '單品豆'], '#1f6f8b', 10),
  ('latte-hot', '熱拿鐵', 'coffee', 120, array['熱', '牛奶'], '#9a6539', 20),
  ('brown-sugar-latte', '黑糖拿鐵', 'coffee', 135, array['甜度固定', '熱賣'], '#b84d35', 30),
  ('oolong-tea', '杉林溪烏龍', 'tea', 90, array['無糖', '回甘'], '#3f7d4c', 40),
  ('lemon-black-tea', '檸檬紅茶', 'tea', 80, array['冰', '微酸'], '#d19a2a', 50),
  ('bagel', '奶油貝果', 'food', 75, array['烘烤', '點心'], '#c47b47', 60),
  ('croissant', '可頌', 'food', 85, array['烘烤', '限量'], '#d6a84f', 70),
  ('drip-bag', '耳掛咖啡', 'retail', 45, array['零售', '可加購'], '#5c6f9c', 80)
on conflict (sku) do update
set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  tags = excluded.tags,
  accent = excluded.accent,
  sort_order = excluded.sort_order,
  is_available = true;
