create table if not exists public.pos_station_heartbeats (
  station_id text primary key,
  station_label text not null default '',
  platform text not null default '',
  app_version text not null default '',
  user_agent text not null default '',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists pos_station_heartbeats_last_seen_idx
on public.pos_station_heartbeats(last_seen_at desc);

alter table public.pos_station_heartbeats enable row level security;

drop policy if exists "No direct client access to station heartbeats" on public.pos_station_heartbeats;
create policy "No direct client access to station heartbeats"
on public.pos_station_heartbeats
for all
to anon, authenticated
using (false)
with check (false);
