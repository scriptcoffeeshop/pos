alter table public.orders
  add column if not exists tax_id text not null default '',
  add column if not exists invoice_carrier_barcode text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_tax_id_format'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_tax_id_format
      check (tax_id = '' or tax_id ~ '^[0-9]{8}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_invoice_carrier_barcode_length'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_invoice_carrier_barcode_length
      check (char_length(invoice_carrier_barcode) <= 32);
  end if;
end $$;
