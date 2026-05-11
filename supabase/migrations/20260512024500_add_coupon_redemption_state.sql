alter table public.member_coupons
  add column if not exists redeemed_order_id uuid references public.orders(id) on delete set null,
  add column if not exists redeemed_at timestamptz,
  add column if not exists redemption_station_id text not null default '';

create index if not exists member_coupons_redeemed_order_idx
  on public.member_coupons(redeemed_order_id)
  where redeemed_order_id is not null;

create index if not exists member_coupons_active_code_idx
  on public.member_coupons(code, status, expires_at)
  where status = 'active';
