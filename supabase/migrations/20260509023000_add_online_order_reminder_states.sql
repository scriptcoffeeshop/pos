alter table public.pos_realtime_events
  drop constraint if exists pos_realtime_events_topic_check;

alter table public.pos_realtime_events
  add constraint pos_realtime_events_topic_check
  check (topic in ('orders', 'runtime_settings', 'register_sessions', 'products', 'online_order_reminders'));

create table if not exists public.online_order_reminder_states (
  order_id uuid primary key references public.orders(id) on delete cascade,
  order_number text not null,
  status text not null default 'active'
    check (status in ('active', 'snoozed', 'seen')),
  snoozed_until timestamptz,
  snoozed_by_station_id text not null default '',
  seen_at timestamptz,
  seen_by_station_id text not null default '',
  last_action text not null default 'active'
    check (last_action in ('active', 'snooze', 'seen', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists online_order_reminder_states_order_number_idx
  on public.online_order_reminder_states(order_number);

create index if not exists online_order_reminder_states_status_snoozed_until_idx
  on public.online_order_reminder_states(status, snoozed_until);

alter table public.online_order_reminder_states enable row level security;

create or replace function public.set_online_order_reminder_state_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_online_order_reminder_state_updated_at() from public;
revoke execute on function public.set_online_order_reminder_state_updated_at() from anon;
revoke execute on function public.set_online_order_reminder_state_updated_at() from authenticated;

drop trigger if exists set_online_order_reminder_state_updated_at
  on public.online_order_reminder_states;
create trigger set_online_order_reminder_state_updated_at
before update on public.online_order_reminder_states
for each row execute function public.set_online_order_reminder_state_updated_at();

create or replace function public.emit_pos_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_topic text := tg_argv[0];
  v_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_entity_id text := coalesce(v_data ->> 'id', v_data ->> 'key', '');
  v_payload jsonb := '{}'::jsonb;
begin
  if v_topic = 'runtime_settings' then
    v_entity_id := coalesce(v_data ->> 'key', '');
    if v_entity_id not in ('printer_settings', 'online_ordering', 'pos_appearance', 'floor_plan') then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
    v_payload := jsonb_build_object('key', v_entity_id);
  elsif v_topic = 'orders' then
    v_payload := jsonb_build_object(
      'orderNumber', v_data ->> 'order_number',
      'source', v_data ->> 'source',
      'status', v_data ->> 'status',
      'paymentStatus', v_data ->> 'payment_status',
      'claimedBy', coalesce(v_data ->> 'claimed_by', ''),
      'claimExpiresAt', coalesce(v_data ->> 'claim_expires_at', '')
    );
  elsif v_topic = 'register_sessions' then
    v_payload := jsonb_build_object(
      'status', v_data ->> 'status',
      'openedAt', v_data ->> 'opened_at',
      'closedAt', coalesce(v_data ->> 'closed_at', '')
    );
  elsif v_topic = 'products' then
    v_payload := jsonb_build_object(
      'sku', v_data ->> 'sku',
      'category', v_data ->> 'category',
      'isAvailable', coalesce(v_data ->> 'is_available', ''),
      'sortOrder', coalesce(v_data ->> 'sort_order', '')
    );
  elsif v_topic = 'online_order_reminders' then
    v_entity_id := coalesce(v_data ->> 'order_number', v_data ->> 'order_id', '');
    v_payload := jsonb_build_object(
      'orderNumber', v_data ->> 'order_number',
      'status', v_data ->> 'status',
      'snoozedUntil', coalesce(v_data ->> 'snoozed_until', ''),
      'seenAt', coalesce(v_data ->> 'seen_at', ''),
      'lastAction', coalesce(v_data ->> 'last_action', '')
    );
  end if;

  insert into public.pos_realtime_events (
    topic,
    event_name,
    source_table,
    entity_id,
    payload
  )
  values (
    v_topic,
    tg_op,
    tg_table_name,
    v_entity_id,
    v_payload
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.emit_pos_realtime_event() from public;
revoke execute on function public.emit_pos_realtime_event() from anon;
revoke execute on function public.emit_pos_realtime_event() from authenticated;

drop trigger if exists emit_pos_realtime_online_order_reminders_event
  on public.online_order_reminder_states;
create trigger emit_pos_realtime_online_order_reminders_event
after insert or update or delete on public.online_order_reminder_states
for each row execute function public.emit_pos_realtime_event('online_order_reminders');
