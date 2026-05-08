insert into public.pos_settings (key, value)
values
  (
    'online_ordering',
    '{
      "enabled": true,
      "allowScheduledOrders": true,
      "averagePrepMinutes": 20,
      "unconfirmedReminderMinutes": 5,
      "soundEnabled": true,
      "pauseMessage": "目前暫停線上點餐，請稍後再試"
    }'::jsonb
  )
on conflict (key) do update
set
  value = excluded.value
    || public.pos_settings.value,
  updated_at = now();
