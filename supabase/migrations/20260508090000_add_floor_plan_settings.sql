insert into public.pos_settings (key, value)
values (
  'floor_plan',
  '{
    "tables": [
      { "id": "A2", "label": "A2", "capacity": 2, "x": 34, "y": 28, "width": 13 },
      { "id": "A3", "label": "A3", "capacity": 2, "x": 58, "y": 28, "width": 13 },
      { "id": "A1", "label": "A1", "capacity": 4, "x": 36, "y": 58, "width": 20 }
    ],
    "display": {
      "showPeople": true,
      "showUnsubmittedWait": true,
      "showTableStay": true,
      "showWaitlinePeople": true,
      "showWaitlineTime": true,
      "showOrderLabels": false
    },
    "partySizes": {},
    "waitline": []
  }'::jsonb
)
on conflict (key) do nothing;

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
