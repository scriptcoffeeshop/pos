create table if not exists public.reservation_blacklist_entries (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  normalized_phone text not null,
  customer_name text not null default '',
  reason text not null default '',
  note text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_blacklist_entries_phone_required check (length(trim(normalized_phone)) >= 4)
);

create unique index if not exists reservation_blacklist_entries_phone_idx
  on public.reservation_blacklist_entries(normalized_phone);

create index if not exists reservation_blacklist_entries_active_idx
  on public.reservation_blacklist_entries(is_active, updated_at desc);

drop trigger if exists set_reservation_blacklist_entries_updated_at on public.reservation_blacklist_entries;
create trigger set_reservation_blacklist_entries_updated_at
before update on public.reservation_blacklist_entries
for each row execute function public.set_updated_at();

alter table public.reservation_blacklist_entries enable row level security;

drop policy if exists "No direct client access to reservation blacklist entries"
on public.reservation_blacklist_entries;
create policy "No direct client access to reservation blacklist entries"
on public.reservation_blacklist_entries
for all
to anon, authenticated
using (false)
with check (false);
