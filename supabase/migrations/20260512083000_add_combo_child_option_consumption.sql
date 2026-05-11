create or replace function public.apply_combo_option_consumption_for_order_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_combo_item jsonb;
  v_combo_quantity integer;
  v_total_quantity integer;
  v_rule record;
  v_consumed numeric(12, 3);
  v_after numeric(12, 3);
begin
  if new.print_paused is true or jsonb_typeof(new.combo_items) <> 'array' then
    return new;
  end if;

  select *
  into v_order
  from public.orders
  where id = new.order_id;

  for v_combo_item in select * from jsonb_array_elements(new.combo_items)
  loop
    if jsonb_typeof(v_combo_item -> 'options') <> 'array' then
      continue;
    end if;

    v_combo_quantity := coalesce((v_combo_item ->> 'quantity')::integer, 0);
    if v_combo_quantity <= 0 then
      continue;
    end if;

    v_total_quantity := new.quantity * v_combo_quantity;

    for v_rule in
      select
        rule.id,
        rule.option_label,
        rule.item_id,
        rule.quantity,
        item.stock_quantity
      from public.inventory_consumption_rules rule
      join public.inventory_items item on item.id = rule.item_id
      where rule.is_active
        and item.is_active
        and rule.subject_type = 'option'
        and exists (
          select 1
          from jsonb_array_elements_text(v_combo_item -> 'options') option_value(value)
          where option_value.value = rule.option_label
        )
      order by rule.sort_order, rule.id
      for update of item
    loop
      v_consumed := round(v_rule.quantity * v_total_quantity, 3);

      update public.inventory_items
      set stock_quantity = round(stock_quantity - v_consumed, 3)
      where id = v_rule.item_id
      returning stock_quantity into v_after;

      insert into public.inventory_records (
        item_id,
        action,
        quantity,
        quantity_delta,
        quantity_after,
        unit_cost,
        total_cost,
        note,
        station_id
      )
      values (
        v_rule.item_id,
        'consumption',
        v_consumed,
        -v_consumed,
        v_after,
        0,
        0,
        left(
          concat(
            '自動消耗 ',
            coalesce(nullif(v_order.order_number, ''), new.order_id::text),
            ' · ',
            coalesce(nullif(v_combo_item ->> 'name', ''), '套餐子項目'),
            ' · ',
            v_rule.option_label
          ),
          240
        ),
        'auto-consume'
      );
    end loop;
  end loop;

  return new;
end;
$$;

revoke execute on function public.apply_combo_option_consumption_for_order_item()
  from public, anon, authenticated;

drop trigger if exists apply_combo_option_consumption_order_item_insert on public.order_items;
create trigger apply_combo_option_consumption_order_item_insert
after insert on public.order_items
for each row execute function public.apply_combo_option_consumption_for_order_item();
