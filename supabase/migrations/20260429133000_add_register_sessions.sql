do $$
begin
  create type public.pos_register_session_status as enum ('open', 'closed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.register_sessions (
  id uuid primary key default gen_random_uuid(),
  status public.pos_register_session_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash integer not null default 0 check (opening_cash >= 0),
  closing_cash integer check (closing_cash is null or closing_cash >= 0),
  expected_cash integer not null default 0 check (expected_cash >= 0),
  cash_sales integer not null default 0 check (cash_sales >= 0),
  non_cash_sales integer not null default 0 check (non_cash_sales >= 0),
  pending_total integer not null default 0 check (pending_total >= 0),
  order_count integer not null default 0 check (order_count >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint register_sessions_closed_fields_check check (
    (status = 'open' and closed_at is null)
    or
    (status = 'closed' and closed_at is not null and closing_cash is not null)
  )
);

create index if not exists register_sessions_status_opened_at_idx
  on public.register_sessions(status, opened_at desc);

create index if not exists register_sessions_closed_at_idx
  on public.register_sessions(closed_at desc)
  where closed_at is not null;

drop trigger if exists set_register_sessions_updated_at on public.register_sessions;
create trigger set_register_sessions_updated_at
before update on public.register_sessions
for each row execute function public.set_updated_at();

alter table public.register_sessions enable row level security;

drop policy if exists "No direct client access to register sessions" on public.register_sessions;
create policy "No direct client access to register sessions"
on public.register_sessions
for all
to anon, authenticated
using (false)
with check (false);
