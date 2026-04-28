create unique index if not exists register_sessions_single_open_idx
  on public.register_sessions ((status))
  where status = 'open';
