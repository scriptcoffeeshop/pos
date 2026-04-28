alter table public.orders
  add column if not exists claimed_by text,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz;

create index if not exists orders_claim_lease_idx
  on public.orders(status, claim_expires_at, claimed_by, created_at desc);
