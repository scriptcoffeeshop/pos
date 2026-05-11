alter table public.products
  add column if not exists barcode text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_barcode_format_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_barcode_format_check
      check (
        char_length(barcode) <= 48
        and barcode ~ '^[A-Za-z0-9.$/+%:-]*$'
      );
  end if;
end $$;

create unique index if not exists products_barcode_unique_idx
  on public.products (barcode)
  where barcode <> '';
