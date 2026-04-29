create or replace function public.create_pos_member(
  p_line_user_id text,
  p_line_display_name text,
  p_opening_balance integer default 0,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_display_name text := nullif(trim(coalesce(p_line_display_name, '')), '');
  v_line_user_id text := nullif(trim(coalesce(p_line_user_id, '')), '');
  v_note text := left(trim(coalesce(p_note, '')), 500);
begin
  if v_display_name is null then
    raise exception 'member display name is required';
  end if;

  if p_opening_balance is null or p_opening_balance < 0 then
    raise exception 'opening balance must be a non-negative integer';
  end if;

  insert into public.members (
    line_user_id,
    line_display_name,
    wallet_balance
  )
  values (
    v_line_user_id,
    v_display_name,
    p_opening_balance
  )
  returning id into v_member_id;

  if p_opening_balance > 0 then
    insert into public.transaction_ledger (
      member_id,
      entry_type,
      amount,
      balance_after,
      note
    )
    values (
      v_member_id,
      'top_up',
      p_opening_balance,
      p_opening_balance,
      coalesce(nullif(v_note, ''), 'opening balance')
    );
  end if;

  return v_member_id;
end;
$$;

create or replace function public.adjust_pos_member_wallet(
  p_member_id uuid,
  p_amount integer,
  p_entry_type text default 'adjustment',
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
  v_entry_type text := coalesce(nullif(trim(p_entry_type), ''), 'adjustment');
  v_note text := left(trim(coalesce(p_note, '')), 500);
begin
  if p_member_id is null then
    raise exception 'member id is required';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'amount must be a non-zero integer';
  end if;

  if v_entry_type not in ('top_up', 'adjustment') then
    raise exception 'entry type must be top_up or adjustment';
  end if;

  select wallet_balance
  into v_balance
  from public.members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  v_next_balance := v_balance + p_amount;
  if v_next_balance < 0 then
    raise exception 'Insufficient wallet balance';
  end if;

  update public.members
  set wallet_balance = v_next_balance
  where id = p_member_id;

  insert into public.transaction_ledger (
    member_id,
    entry_type,
    amount,
    balance_after,
    note
  )
  values (
    p_member_id,
    v_entry_type,
    p_amount,
    v_next_balance,
    coalesce(nullif(v_note, ''), 'wallet adjustment')
  );

  return v_next_balance;
end;
$$;
