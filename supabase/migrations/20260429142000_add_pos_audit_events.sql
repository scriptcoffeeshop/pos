create table if not exists public.pos_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  order_id uuid references public.orders(id) on delete set null,
  register_session_id uuid references public.register_sessions(id) on delete set null,
  station_id text not null default '',
  actor text not null default 'pos-api',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pos_audit_events_created_at_idx
  on public.pos_audit_events(created_at desc);

create index if not exists pos_audit_events_order_id_idx
  on public.pos_audit_events(order_id, created_at desc)
  where order_id is not null;

create index if not exists pos_audit_events_register_session_id_idx
  on public.pos_audit_events(register_session_id, created_at desc)
  where register_session_id is not null;

alter table public.pos_audit_events enable row level security;

drop policy if exists "No direct client access to audit events" on public.pos_audit_events;
create policy "No direct client access to audit events"
on public.pos_audit_events
for all
to anon, authenticated
using (false)
with check (false);
