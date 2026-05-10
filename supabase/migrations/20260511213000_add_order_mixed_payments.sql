alter table public.orders
  add column if not exists payment_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists transaction_receipt_count integer not null default 0;

do $$
begin
  alter table public.orders
    add constraint orders_payment_breakdown_array_check
    check (jsonb_typeof(payment_breakdown) = 'array');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.orders
    add constraint orders_transaction_receipt_count_range_check
    check (transaction_receipt_count between 0 and 10);
exception
  when duplicate_object then null;
end $$;
