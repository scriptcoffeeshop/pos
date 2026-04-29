create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_number text not null default '',
  event_type text not null default '',
  payment_status public.pos_payment_status not null,
  amount integer check (amount is null or amount >= 0),
  applied boolean not null default false,
  duplicate boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists payment_events_order_id_idx
  on public.payment_events(order_id, created_at desc);

alter table public.payment_events enable row level security;

create or replace function public.record_pos_payment_event(
  p_provider text,
  p_event_id text,
  p_order_id uuid,
  p_order_number text,
  p_payment_status public.pos_payment_status,
  p_amount integer,
  p_event_type text,
  p_raw_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := lower(left(trim(coalesce(p_provider, '')), 40));
  v_event_id text := left(trim(coalesce(p_event_id, '')), 120);
  v_event_type text := left(trim(coalesce(p_event_type, '')), 80);
  v_order_number text := left(trim(coalesce(p_order_number, '')), 80);
  v_order public.orders%rowtype;
  v_existing public.payment_events%rowtype;
  v_event public.payment_events%rowtype;
  v_next_payment_status public.pos_payment_status := null;
  v_next_order_status public.pos_order_status := null;
  v_release_claim boolean := false;
  v_applied boolean := false;
  v_reason text := 'no_state_change';
begin
  if v_provider = '' then
    raise exception 'provider is required';
  end if;

  if v_event_id = '' then
    raise exception 'eventId is required';
  end if;

  if p_payment_status not in ('authorized', 'paid', 'failed', 'expired', 'refunded') then
    raise exception 'Unsupported payment status';
  end if;

  if p_amount is not null and p_amount < 0 then
    raise exception 'amount must be a non-negative integer';
  end if;

  select *
  into v_existing
  from public.payment_events
  where provider = v_provider
    and event_id = v_event_id;

  if found then
    return jsonb_build_object(
      'processed', false,
      'duplicate', true,
      'applied', false,
      'reason', 'duplicate_event',
      'eventId', v_existing.id,
      'orderId', v_existing.order_id,
      'orderNumber', v_existing.order_number,
      'paymentStatus', v_existing.payment_status
    );
  end if;

  select *
  into v_order
  from public.orders
  where (p_order_id is not null and id = p_order_id)
    or (v_order_number <> '' and order_number = v_order_number)
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  insert into public.payment_events (
    provider,
    event_id,
    order_id,
    order_number,
    event_type,
    payment_status,
    amount,
    raw_payload
  )
  values (
    v_provider,
    v_event_id,
    v_order.id,
    v_order.order_number,
    v_event_type,
    p_payment_status,
    p_amount,
    coalesce(p_raw_payload, '{}'::jsonb)
  )
  returning *
  into v_event;

  if p_amount is not null and p_amount <> v_order.subtotal then
    v_reason := 'amount_mismatch';
  elsif p_payment_status = 'authorized' and v_order.payment_status = 'pending' then
    v_next_payment_status := 'authorized';
    v_next_order_status := v_order.status;
    v_applied := true;
  elsif p_payment_status = 'paid' and v_order.payment_status in ('pending', 'authorized', 'expired', 'failed') then
    v_next_payment_status := 'paid';
    v_next_order_status := case when v_order.status = 'failed' then 'new' else v_order.status end;
    v_applied := true;
  elsif p_payment_status in ('failed', 'expired') and v_order.payment_status in ('pending', 'authorized') then
    v_next_payment_status := p_payment_status;
    v_next_order_status := 'failed';
    v_release_claim := true;
    v_applied := true;
  elsif p_payment_status = 'refunded' and v_order.payment_status in ('authorized', 'paid') then
    v_next_payment_status := 'refunded';
    v_next_order_status := 'voided';
    v_release_claim := true;
    v_applied := true;
  end if;

  if v_applied then
    update public.orders
    set
      payment_status = v_next_payment_status,
      status = v_next_order_status,
      claimed_by = case when v_release_claim then null else claimed_by end,
      claimed_at = case when v_release_claim then null else claimed_at end,
      claim_expires_at = case when v_release_claim then null else claim_expires_at end
    where id = v_order.id
    returning *
    into v_order;

    if p_payment_status = 'paid' and v_order.subtotal > 0 then
      insert into public.transaction_ledger (
        member_id,
        order_id,
        entry_type,
        amount,
        note
      )
      values (
        v_order.member_id,
        v_order.id,
        'payment',
        v_order.subtotal,
        concat('payment webhook: ', v_provider)
      );
    elsif p_payment_status = 'refunded' and v_order.subtotal > 0 then
      insert into public.transaction_ledger (
        member_id,
        order_id,
        entry_type,
        amount,
        note
      )
      values (
        v_order.member_id,
        v_order.id,
        'refund',
        -v_order.subtotal,
        concat('payment refund webhook: ', v_provider)
      );
    end if;

    v_reason := 'applied';
  end if;

  update public.payment_events
  set
    applied = v_applied,
    processed_at = now()
  where id = v_event.id
  returning *
  into v_event;

  return jsonb_build_object(
    'processed', true,
    'duplicate', false,
    'applied', v_applied,
    'reason', v_reason,
    'eventId', v_event.id,
    'orderId', v_order.id,
    'orderNumber', v_order.order_number,
    'paymentStatus', v_order.payment_status,
    'orderStatus', v_order.status
  );
end;
$$;
