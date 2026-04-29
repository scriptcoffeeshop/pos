alter table public.register_sessions
  add column if not exists open_order_count integer not null default 0 check (open_order_count >= 0),
  add column if not exists failed_payment_count integer not null default 0 check (failed_payment_count >= 0),
  add column if not exists failed_print_count integer not null default 0 check (failed_print_count >= 0),
  add column if not exists voided_order_count integer not null default 0 check (voided_order_count >= 0);
