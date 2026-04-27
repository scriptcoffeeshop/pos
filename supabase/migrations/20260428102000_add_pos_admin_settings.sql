alter table public.products
  add column if not exists pos_visible boolean not null default true,
  add column if not exists online_visible boolean not null default false,
  add column if not exists qr_visible boolean not null default false,
  add column if not exists prep_station text not null default 'bar',
  add column if not exists print_label boolean not null default true;

create table if not exists public.pos_settings (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_channel_available_idx
  on public.products(pos_visible, online_visible, qr_visible, is_available, sort_order);

drop trigger if exists set_pos_settings_updated_at on public.pos_settings;
create trigger set_pos_settings_updated_at
before update on public.pos_settings
for each row execute function public.set_updated_at();

alter table public.pos_settings enable row level security;

drop policy if exists "Public can read available products" on public.products;
create policy "Public can read available products"
on public.products
for select
to anon, authenticated
using (is_available = true and pos_visible = true);

insert into public.pos_settings (key, value)
values
  (
    'printer_settings',
    '{
      "stations": [
        {
          "id": "counter",
          "name": "櫃台出單機",
          "host": "192.168.1.100",
          "port": 9100,
          "protocol": "EZPL over TCP",
          "enabled": true,
          "autoPrint": true
        },
        {
          "id": "kitchen",
          "name": "吧台貼紙機",
          "host": "192.168.1.101",
          "port": 9100,
          "protocol": "EZPL over TCP",
          "enabled": false,
          "autoPrint": false
        }
      ],
      "rules": [
        {
          "id": "takeout-label",
          "name": "外帶貼紙",
          "serviceMode": "takeout",
          "stationId": "counter",
          "categories": ["coffee", "tea", "food", "retail"],
          "copies": 1,
          "labelMode": "label",
          "enabled": true
        },
        {
          "id": "dine-in-receipt",
          "name": "內用收據",
          "serviceMode": "dine-in",
          "stationId": "counter",
          "categories": ["coffee", "tea", "food"],
          "copies": 1,
          "labelMode": "receipt",
          "enabled": true
        }
      ]
    }'::jsonb
  ),
  (
    'access_control',
    '{
      "roles": [
        {
          "id": "owner",
          "name": "店主",
          "pinRequired": true,
          "permissions": [
            "manageProducts",
            "managePrinting",
            "managePayments",
            "manageReports",
            "manageCustomers",
            "manageAccess",
            "voidOrders",
            "closeRegister"
          ]
        },
        {
          "id": "manager",
          "name": "店長",
          "pinRequired": true,
          "permissions": [
            "manageProducts",
            "managePrinting",
            "manageReports",
            "voidOrders",
            "closeRegister"
          ]
        },
        {
          "id": "cashier",
          "name": "櫃台",
          "pinRequired": false,
          "permissions": [
            "voidOrders"
          ]
        }
      ]
    }'::jsonb
  )
on conflict (key) do nothing;
