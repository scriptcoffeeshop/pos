alter table public.orders
  add column if not exists customer_note text not null default '',
  add column if not exists staff_note text not null default '';

alter table public.reservations
  add column if not exists customer_note text not null default '',
  add column if not exists staff_note text not null default '';

alter table public.orders
  drop constraint if exists orders_customer_note_length_check,
  drop constraint if exists orders_staff_note_length_check;

alter table public.orders
  add constraint orders_customer_note_length_check
  check (char_length(customer_note) <= 500),
  add constraint orders_staff_note_length_check
  check (char_length(staff_note) <= 500);

alter table public.reservations
  drop constraint if exists reservations_customer_note_length_check,
  drop constraint if exists reservations_staff_note_length_check;

alter table public.reservations
  add constraint reservations_customer_note_length_check
  check (char_length(customer_note) <= 500),
  add constraint reservations_staff_note_length_check
  check (char_length(staff_note) <= 500);

update public.orders
set staff_note = note
where source = 'counter'
  and staff_note = ''
  and note <> '';

update public.orders
set customer_note = left(
  array_to_string(
    array(
      select trim(segment)
      from regexp_split_to_table(note, '\s*·\s*') as segment
      where trim(segment) <> ''
        and trim(segment) !~ '^樓層\s+\S+'
        and trim(segment) !~ '^桌位\s+\S+'
    ),
    ' · '
  ),
  500
)
where source in ('online', 'qr')
  and customer_note = ''
  and note <> '';
