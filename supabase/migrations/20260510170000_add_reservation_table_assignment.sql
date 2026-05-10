alter table public.reservations
  add column if not exists assigned_table_ids text[] not null default '{}'::text[];

create index if not exists reservations_assigned_table_ids_gin_idx
  on public.reservations using gin (assigned_table_ids);
