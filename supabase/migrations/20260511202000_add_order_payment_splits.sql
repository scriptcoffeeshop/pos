alter table public.orders
  add column if not exists payment_splits jsonb not null default '[]'::jsonb;

do $$
begin
  alter table public.orders
    add constraint orders_payment_splits_array_check
    check (jsonb_typeof(payment_splits) = 'array');
exception
  when duplicate_object then null;
end $$;
