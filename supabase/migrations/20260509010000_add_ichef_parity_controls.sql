alter table public.members
  add column if not exists phone text not null default '',
  add column if not exists customer_type text not null default '一般顧客',
  add column if not exists points_balance integer not null default 0 check (points_balance >= 0);

alter table public.products
  add column if not exists supply_windows jsonb not null default '[]'::jsonb,
  add column if not exists future_order_available boolean not null default false;

alter table public.orders
  add column if not exists order_labels text[] not null default '{}',
  add column if not exists service_fee_rate integer not null default 0 check (service_fee_rate >= 0 and service_fee_rate <= 30),
  add column if not exists service_fee_amount integer not null default 0 check (service_fee_amount >= 0),
  add column if not exists extra_fee_amount integer not null default 0 check (extra_fee_amount >= 0),
  add column if not exists discount_amount integer not null default 0 check (discount_amount >= 0),
  add column if not exists points_redeemed integer not null default 0 check (points_redeemed >= 0),
  add column if not exists coupon_code text not null default '',
  add column if not exists member_points_earned integer not null default 0 check (member_points_earned >= 0);

create table if not exists public.member_coupons (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete cascade,
  code text not null,
  title text not null,
  discount_amount integer not null default 0 check (discount_amount >= 0),
  discount_percent integer not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null default '訂位客',
  customer_phone text not null default '',
  party_size integer not null default 2 check (party_size > 0 and party_size <= 50),
  reserved_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'seated', 'cancelled', 'no_show')),
  important_label text not null default '',
  pre_order jsonb not null default '[]'::jsonb,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists members_phone_idx on public.members(phone);
create index if not exists members_customer_type_idx on public.members(customer_type);
create index if not exists orders_member_id_idx on public.orders(member_id, created_at desc);
create index if not exists member_coupons_member_status_idx on public.member_coupons(member_id, status, expires_at);
create index if not exists member_coupons_code_idx on public.member_coupons(code);
create index if not exists reservations_reserved_at_idx on public.reservations(reserved_at);
create index if not exists reservations_status_idx on public.reservations(status, reserved_at);

drop trigger if exists set_member_coupons_updated_at on public.member_coupons;
create trigger set_member_coupons_updated_at
before update on public.member_coupons
for each row execute function public.set_updated_at();

drop trigger if exists set_reservations_updated_at on public.reservations;
create trigger set_reservations_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

alter table public.member_coupons enable row level security;
alter table public.reservations enable row level security;

insert into public.pos_settings (key, value)
values (
  'engagement_settings',
  '{
    "orderLabels": [
      { "id": "rush", "label": "急單", "color": "#b45309" },
      { "id": "allergy", "label": "過敏", "color": "#b91c1c" },
      { "id": "vip", "label": "VIP", "color": "#0f766e" }
    ],
    "customerTypes": ["一般顧客", "常客", "VIP", "員工"],
    "defaultServiceFeeRate": 0,
    "recommendations": [
      { "id": "retail-add-on", "trigger": "coffee", "title": "咖啡加購", "productIds": [], "enabled": true },
      { "id": "food-pairing", "trigger": "morning", "title": "早餐搭配", "productIds": [], "enabled": true }
    ],
    "translations": [
      { "locale": "en", "label": "English", "enabled": true },
      { "locale": "ja", "label": "日本語", "enabled": false }
    ],
    "hardwareDevices": [
      { "id": "scanner", "kind": "bluetooth-scanner", "name": "藍牙掃碼器", "enabled": false, "targetStationId": "" },
      { "id": "payment-qr", "kind": "payment-qr", "name": "行動支付掃碼", "enabled": false, "targetStationId": "" },
      { "id": "cash-drawer", "kind": "cash-drawer", "name": "錢櫃", "enabled": false, "targetStationId": "" },
      { "id": "ipad-qr-print", "kind": "ipad-qr-print", "name": "指定 iPad 列印 QR code", "enabled": false, "targetStationId": "" }
    ],
    "supplyRules": {
      "preOpenCheckEnabled": true,
      "allowFutureOrdersAcrossDay": true,
      "defaultWindows": [
        { "id": "all-day", "label": "全天", "days": [1,2,3,4,5,6,0], "start": "08:00", "end": "22:00" }
      ]
    }
  }'::jsonb
)
on conflict (key) do nothing;
