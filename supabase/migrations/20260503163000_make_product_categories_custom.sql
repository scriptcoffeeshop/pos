drop index if exists public.products_category_available_idx;

alter table public.products
  alter column category type text using category::text;

alter table public.products
  drop constraint if exists products_category_not_blank;

alter table public.products
  add constraint products_category_not_blank
  check (length(trim(category)) > 0);

create index if not exists products_category_available_idx
  on public.products(category, is_available, sort_order);
