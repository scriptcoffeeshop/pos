alter table public.orders
  add column if not exists zero_tax_sales_reason text not null default '';

alter table public.orders
  drop constraint if exists orders_zero_tax_sales_reason_length;

alter table public.orders
  add constraint orders_zero_tax_sales_reason_length
  check (char_length(zero_tax_sales_reason) <= 120);
