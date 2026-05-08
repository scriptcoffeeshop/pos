create table if not exists public.pos_realtime_events (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('orders', 'runtime_settings', 'register_sessions', 'products')),
  event_name text not null check (event_name in ('INSERT', 'UPDATE', 'DELETE')),
  source_table text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pos_realtime_events_created_at_idx
  on public.pos_realtime_events(created_at desc);

create index if not exists pos_realtime_events_topic_created_at_idx
  on public.pos_realtime_events(topic, created_at desc);

alter table public.pos_realtime_events enable row level security;

drop policy if exists "POS clients can read realtime events" on public.pos_realtime_events;
create policy "POS clients can read realtime events"
on public.pos_realtime_events
for select
to anon, authenticated
using (true);

grant select on public.pos_realtime_events to anon, authenticated;

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
    if v_entity_id not in ('printer_settings', 'online_ordering', 'pos_appearance') then
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

drop trigger if exists emit_pos_realtime_orders_event on public.orders;
create trigger emit_pos_realtime_orders_event
after insert or update or delete on public.orders
for each row execute function public.emit_pos_realtime_event('orders');

drop trigger if exists emit_pos_realtime_runtime_settings_event on public.pos_settings;
create trigger emit_pos_realtime_runtime_settings_event
after insert or update or delete on public.pos_settings
for each row execute function public.emit_pos_realtime_event('runtime_settings');

drop trigger if exists emit_pos_realtime_register_sessions_event on public.register_sessions;
create trigger emit_pos_realtime_register_sessions_event
after insert or update or delete on public.register_sessions
for each row execute function public.emit_pos_realtime_event('register_sessions');

drop trigger if exists emit_pos_realtime_products_event on public.products;
create trigger emit_pos_realtime_products_event
after insert or update or delete on public.products
for each row execute function public.emit_pos_realtime_event('products');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'pos_realtime_events'
    )
  then
    alter publication supabase_realtime add table public.pos_realtime_events;
  end if;
end $$;
