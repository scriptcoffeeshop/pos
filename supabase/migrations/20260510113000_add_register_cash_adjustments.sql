do $$
begin
  create type public.pos_register_cash_adjustment_kind as enum ('income', 'expense');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.register_cash_adjustments (
  id uuid primary key default gen_random_uuid(),
  register_session_id uuid not null references public.register_sessions(id) on delete cascade,
  kind public.pos_register_cash_adjustment_kind not null,
  reason text not null check (length(trim(reason)) > 0),
  amount integer not null check (amount > 0),
  note text not null default '',
  station_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists register_cash_adjustments_session_created_at_idx
  on public.register_cash_adjustments(register_session_id, created_at desc);

alter table public.register_cash_adjustments enable row level security;

drop policy if exists "No direct client access to register cash adjustments" on public.register_cash_adjustments;
create policy "No direct client access to register cash adjustments"
on public.register_cash_adjustments
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.touch_register_session_for_cash_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_register_session_id uuid := case when tg_op = 'DELETE' then old.register_session_id else new.register_session_id end;
begin
  update public.register_sessions
  set updated_at = now()
  where id = v_register_session_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke execute on function public.touch_register_session_for_cash_adjustment() from public;
revoke execute on function public.touch_register_session_for_cash_adjustment() from anon;
revoke execute on function public.touch_register_session_for_cash_adjustment() from authenticated;

drop trigger if exists touch_register_session_for_cash_adjustment
  on public.register_cash_adjustments;
create trigger touch_register_session_for_cash_adjustment
after insert or update or delete on public.register_cash_adjustments
for each row execute function public.touch_register_session_for_cash_adjustment();
