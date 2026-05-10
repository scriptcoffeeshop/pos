do $$
begin
  create type public.pos_time_clock_event_type as enum ('clock_in', 'clock_out');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.staff_time_clock_entries (
  id uuid primary key default gen_random_uuid(),
  staff_account_id text not null,
  staff_code text not null,
  staff_name text not null,
  role_id text not null default '',
  role_name text not null default '',
  event_type public.pos_time_clock_event_type not null,
  station_id text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists staff_time_clock_entries_staff_created_at_idx
  on public.staff_time_clock_entries(staff_account_id, created_at desc);

create index if not exists staff_time_clock_entries_created_at_idx
  on public.staff_time_clock_entries(created_at desc);

alter table public.staff_time_clock_entries enable row level security;

drop policy if exists "No direct client access to staff time clock entries"
  on public.staff_time_clock_entries;
create policy "No direct client access to staff time clock entries"
on public.staff_time_clock_entries
for all
to anon, authenticated
using (false)
with check (false);
