alter table public.products
  add column if not exists tax_category text not null default 'taxable';

alter table public.products
  drop constraint if exists products_tax_category_valid;

alter table public.products
  add constraint products_tax_category_valid
  check (tax_category in ('taxable', 'zero', 'exempt'));

alter table public.order_items
  add column if not exists tax_category text;

alter table public.order_items
  alter column tax_category drop default;

alter table public.order_items
  drop constraint if exists order_items_tax_category_valid;

update public.order_items as item
set tax_category = product.tax_category
from public.products as product
where item.product_id = product.id
  and (item.tax_category is null or item.tax_category not in ('taxable', 'zero', 'exempt'));

update public.order_items
set tax_category = 'taxable'
where tax_category is null
  or tax_category not in ('taxable', 'zero', 'exempt');

alter table public.order_items
  add constraint order_items_tax_category_valid
  check (tax_category in ('taxable', 'zero', 'exempt'));

create or replace function public.set_order_item_tax_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_tax_category text;
begin
  if new.tax_category in ('taxable', 'zero', 'exempt') then
    return new;
  end if;

  if new.product_id is not null then
    select product.tax_category
    into v_product_tax_category
    from public.products as product
    where product.id = new.product_id;
  end if;

  new.tax_category := case
    when v_product_tax_category in ('taxable', 'zero', 'exempt') then v_product_tax_category
    else 'taxable'
  end;

  return new;
end;
$$;

drop trigger if exists set_order_item_tax_category on public.order_items;

create trigger set_order_item_tax_category
before insert or update of product_id, tax_category
on public.order_items
for each row
execute function public.set_order_item_tax_category();

alter table public.order_items
  alter column tax_category set not null;

revoke execute on function public.set_order_item_tax_category()
from public, anon, authenticated;
