create or replace function public.refund_pos_order(
  p_order_id uuid,
  p_station_id text,
  p_note text default ''
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_updated public.orders%rowtype;
  v_now timestamptz := now();
  v_note text := left(trim(coalesce(p_note, '')), 240);
begin
  if p_station_id is null or btrim(p_station_id) = '' then
    raise exception 'stationId is required';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.payment_status not in ('authorized', 'paid') then
    raise exception 'Only authorized or paid orders can be refunded';
  end if;

  if v_order.status in ('failed', 'voided') then
    raise exception 'Failed or voided orders cannot be refunded again';
  end if;

  if v_order.claimed_by is not null
    and v_order.claimed_by <> p_station_id
    and v_order.claim_expires_at is not null
    and v_order.claim_expires_at > v_now then
    raise exception 'Order is already claimed by %', v_order.claimed_by;
  end if;

  update public.orders
  set
    status = 'voided',
    payment_status = 'refunded',
    note = concat_ws(E'\n', nullif(v_order.note, ''), case
      when v_note = '' then '已退款'
      else concat('已退款：', v_note)
    end),
    claimed_by = null,
    claimed_at = null,
    claim_expires_at = null
  where id = v_order.id
  returning *
  into v_updated;

  if v_order.subtotal > 0 then
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
      case
        when v_note = '' then 'POS refund'
        else concat('POS refund: ', v_note)
      end
    );
  end if;

  return v_updated;
end;
$$;
