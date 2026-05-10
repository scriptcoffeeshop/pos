alter table public.pos_realtime_events
  drop constraint if exists pos_realtime_events_topic_check;

alter table public.pos_realtime_events
  add constraint pos_realtime_events_topic_check
  check (topic in ('orders', 'runtime_settings', 'register_sessions', 'products', 'online_order_reminders', 'cash_drawer'));
