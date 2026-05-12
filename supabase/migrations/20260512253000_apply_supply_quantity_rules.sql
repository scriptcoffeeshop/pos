create or replace function public.apply_product_supply_quantity_rules()
returns trigger
language plpgsql
as $$
begin
  if new.inventory_count is not null then
    new.inventory_count = least(999, greatest(0, new.inventory_count));
  end if;

  if new.inventory_count = 0 then
    new.is_available = false;
    new.online_visible = false;
    new.qr_visible = false;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_product_supply_quantity_rules_on_products on public.products;
create trigger apply_product_supply_quantity_rules_on_products
before insert or update of inventory_count, is_available, online_visible, qr_visible on public.products
for each row
execute function public.apply_product_supply_quantity_rules();
