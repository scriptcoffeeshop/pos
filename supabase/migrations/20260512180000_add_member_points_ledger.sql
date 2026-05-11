create table if not exists public.member_points_ledger (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  related_ledger_id uuid references public.member_points_ledger(id) on delete set null,
  entry_type text not null check (entry_type in ('earn', 'redeem', 'restore', 'adjustment')),
  points_delta integer not null check (points_delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  station_id text not null default '',
  note text not null default '',
  reversed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists member_points_ledger_member_idx
  on public.member_points_ledger(member_id, created_at desc);

create index if not exists member_points_ledger_order_idx
  on public.member_points_ledger(order_id)
  where order_id is not null;

create index if not exists member_points_ledger_related_idx
  on public.member_points_ledger(related_ledger_id)
  where related_ledger_id is not null;

alter table public.member_points_ledger enable row level security;

drop policy if exists "No direct client access to member points ledger" on public.member_points_ledger;
create policy "No direct client access to member points ledger"
on public.member_points_ledger
for all
to anon, authenticated
using (false)
with check (false);

grant all on public.member_points_ledger to service_role;

update public.pos_settings
set value = jsonb_set(
  value,
  '{loyaltyPoints}',
  '{
    "enabled": true,
    "earningEnabled": true,
    "redeemEnabled": true,
    "spendAmountPerPoint": 100,
    "minimumRedeemPoints": 1,
    "maximumRedeemPointsPerOrder": 0
  }'::jsonb,
  true
)
where key = 'engagement_settings'
  and not (value ? 'loyaltyPoints');

create or replace function public.redeem_pos_member_points(
  p_member_id uuid,
  p_points integer,
  p_station_id text default '',
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_next_balance integer;
  v_ledger_id uuid;
  v_station_id text := left(trim(coalesce(p_station_id, '')), 80);
  v_note text := left(trim(coalesce(p_note, '')), 500);
begin
  if p_member_id is null then
    raise exception 'member id is required';
  end if;

  if p_points is null or p_points <= 0 then
    return null;
  end if;

  select points_balance
  into v_balance
  from public.members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  if v_balance < p_points then
    raise exception 'Insufficient points balance';
  end if;

  v_next_balance := v_balance - p_points;

  update public.members
  set points_balance = v_next_balance
  where id = p_member_id;

  insert into public.member_points_ledger (
    member_id,
    entry_type,
    points_delta,
    balance_after,
    station_id,
    note
  )
  values (
    p_member_id,
    'redeem',
    -p_points,
    v_next_balance,
    v_station_id,
    coalesce(nullif(v_note, ''), 'POS point redemption')
  )
  returning id into v_ledger_id;

  return v_ledger_id;
end;
$$;

create or replace function public.release_pos_member_point_redemption(
  p_ledger_id uuid,
  p_station_id text default '',
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.member_points_ledger%rowtype;
  v_balance integer;
  v_restore_points integer;
  v_next_balance integer;
  v_station_id text := left(trim(coalesce(p_station_id, '')), 80);
  v_note text := left(trim(coalesce(p_note, '')), 500);
begin
  if p_ledger_id is null then
    return;
  end if;

  select *
  into v_redemption
  from public.member_points_ledger
  where id = p_ledger_id
    and entry_type = 'redeem'
    and order_id is null
    and reversed_at is null
  for update;

  if not found then
    return;
  end if;

  select points_balance
  into v_balance
  from public.members
  where id = v_redemption.member_id
  for update;

  if not found then
    return;
  end if;

  v_restore_points := abs(v_redemption.points_delta);
  v_next_balance := v_balance + v_restore_points;

  update public.members
  set points_balance = v_next_balance
  where id = v_redemption.member_id;

  update public.member_points_ledger
  set reversed_at = now()
  where id = v_redemption.id;

  insert into public.member_points_ledger (
    member_id,
    related_ledger_id,
    entry_type,
    points_delta,
    balance_after,
    station_id,
    note
  )
  values (
    v_redemption.member_id,
    v_redemption.id,
    'restore',
    v_restore_points,
    v_next_balance,
    v_station_id,
    coalesce(nullif(v_note, ''), 'POS point redemption released')
  );
end;
$$;

create or replace function public.finalize_pos_member_points(
  p_redemption_ledger_id uuid,
  p_order_id uuid,
  p_member_id uuid,
  p_points_earned integer default 0,
  p_station_id text default '',
  p_note text default ''
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_next_balance integer;
  v_station_id text := left(trim(coalesce(p_station_id, '')), 80);
  v_note text := left(trim(coalesce(p_note, '')), 500);
begin
  if p_member_id is null then
    return 0;
  end if;

  if p_order_id is null then
    raise exception 'order id is required';
  end if;

  if p_redemption_ledger_id is not null then
    update public.member_points_ledger
    set order_id = p_order_id
    where id = p_redemption_ledger_id
      and member_id = p_member_id
      and entry_type = 'redeem'
      and order_id is null
      and reversed_at is null;

    if not found then
      raise exception 'Point redemption claim not found';
    end if;
  end if;

  select points_balance
  into v_balance
  from public.members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  if p_points_earned is null or p_points_earned <= 0 then
    return v_balance;
  end if;

  v_next_balance := v_balance + p_points_earned;

  update public.members
  set points_balance = v_next_balance
  where id = p_member_id;

  insert into public.member_points_ledger (
    member_id,
    order_id,
    entry_type,
    points_delta,
    balance_after,
    station_id,
    note
  )
  values (
    p_member_id,
    p_order_id,
    'earn',
    p_points_earned,
    v_next_balance,
    v_station_id,
    coalesce(nullif(v_note, ''), 'POS point earn')
  );

  return v_next_balance;
end;
$$;

create or replace function public.restore_pos_member_points_for_order(
  p_order_id uuid,
  p_station_id text default '',
  p_note text default ''
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_member_id uuid;
  v_balance integer;
  v_next_balance integer;
  v_delta integer := 0;
  v_change integer;
  v_entry public.member_points_ledger%rowtype;
  v_station_id text := left(trim(coalesce(p_station_id, '')), 80);
  v_note text := left(trim(coalesce(p_note, '')), 500);
begin
  if p_order_id is null then
    return 0;
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_order.member_id is null then
    return 0;
  end if;

  v_member_id := v_order.member_id;

  select points_balance
  into v_balance
  from public.members
  where id = v_member_id
  for update;

  if not found then
    return 0;
  end if;

  for v_entry in
    select *
    from public.member_points_ledger
    where order_id = p_order_id
      and member_id = v_member_id
      and entry_type in ('redeem', 'earn')
      and reversed_at is null
    order by created_at asc
  loop
    if v_entry.entry_type = 'redeem' then
      v_change := abs(v_entry.points_delta);
      v_next_balance := v_balance + v_change;

      update public.members
      set points_balance = v_next_balance
      where id = v_member_id;

      update public.member_points_ledger
      set reversed_at = now()
      where id = v_entry.id;

      insert into public.member_points_ledger (
        member_id,
        order_id,
        related_ledger_id,
        entry_type,
        points_delta,
        balance_after,
        station_id,
        note
      )
      values (
        v_member_id,
        p_order_id,
        v_entry.id,
        'restore',
        v_change,
        v_next_balance,
        v_station_id,
        coalesce(nullif(v_note, ''), 'POS point redemption restored')
      );

      v_balance := v_next_balance;
      v_delta := v_delta + v_change;
    elsif v_entry.entry_type = 'earn' then
      v_change := least(v_balance, v_entry.points_delta);

      update public.member_points_ledger
      set reversed_at = now()
      where id = v_entry.id;

      if v_change > 0 then
        v_next_balance := v_balance - v_change;

        update public.members
        set points_balance = v_next_balance
        where id = v_member_id;

        insert into public.member_points_ledger (
          member_id,
          order_id,
          related_ledger_id,
          entry_type,
          points_delta,
          balance_after,
          station_id,
          note
        )
        values (
          v_member_id,
          p_order_id,
          v_entry.id,
          'adjustment',
          -v_change,
          v_next_balance,
          v_station_id,
          coalesce(nullif(v_note, ''), 'POS point earn reversed')
        );

        v_balance := v_next_balance;
        v_delta := v_delta - v_change;
      end if;
    end if;
  end loop;

  return v_delta;
end;
$$;

revoke execute on function public.redeem_pos_member_points(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_pos_member_points(uuid, integer, text, text)
  to service_role;

revoke execute on function public.release_pos_member_point_redemption(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.release_pos_member_point_redemption(uuid, text, text)
  to service_role;

revoke execute on function public.finalize_pos_member_points(uuid, uuid, uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_pos_member_points(uuid, uuid, uuid, integer, text, text)
  to service_role;

revoke execute on function public.restore_pos_member_points_for_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.restore_pos_member_points_for_order(uuid, text, text)
  to service_role;
