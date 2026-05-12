alter table public.orders
  add column if not exists payment_note text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_payment_note_length_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_payment_note_length_check
      check (char_length(payment_note) <= 240);
  end if;
end $$;
