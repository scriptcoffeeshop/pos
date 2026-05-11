alter table public.register_sessions
  add column if not exists book_id text not null default 'main',
  add column if not exists book_name text not null default '主帳本',
  add column if not exists station_id text not null default '';

alter table public.orders
  add column if not exists register_session_id uuid references public.register_sessions(id) on delete set null,
  add column if not exists checkout_station_id text not null default '',
  add column if not exists checkout_book_id text not null default 'main';

update public.register_sessions
set
  book_id = coalesce(nullif(book_id, ''), 'main'),
  book_name = coalesce(nullif(book_name, ''), '主帳本');

update public.orders
set checkout_book_id = coalesce(nullif(checkout_book_id, ''), 'main');

with current_main_session as (
  select id, opened_at
  from public.register_sessions
  where status = 'open'
    and book_id = 'main'
  order by opened_at desc
  limit 1
)
update public.orders
set
  register_session_id = current_main_session.id,
  checkout_book_id = 'main'
from current_main_session
where public.orders.register_session_id is null
  and public.orders.created_at >= current_main_session.opened_at
  and public.orders.status <> 'voided';

drop index if exists register_sessions_single_open_idx;

create unique index if not exists register_sessions_open_book_idx
  on public.register_sessions (book_id)
  where status = 'open';

create index if not exists orders_register_session_idx
  on public.orders(register_session_id)
  where register_session_id is not null;

create index if not exists orders_checkout_book_idx
  on public.orders(checkout_book_id, created_at desc);

update public.pos_settings
set value = jsonb_set(
  value,
  '{checkoutCounters}',
  coalesce(value -> 'checkoutCounters', jsonb_build_object(
    'enabled', false,
    'defaultBookId', 'main',
    'books', jsonb_build_array(jsonb_build_object(
      'id', 'main',
      'name', '主帳本',
      'stationIds', jsonb_build_array(),
      'printStationId', '',
      'cashDrawerDeviceId', 'cash-drawer',
      'paymentDeviceIds', jsonb_build_array(),
      'enabled', true
    ))
  )),
  true
)
where key = 'engagement_settings';
