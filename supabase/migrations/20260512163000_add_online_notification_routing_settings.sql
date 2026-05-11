update public.pos_settings
set
  value = jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{notificationRouting}',
    case
      when jsonb_typeof(value->'notificationRouting') = 'object'
        then jsonb_build_object(
          'stations',
          coalesce(value->'notificationRouting'->'stations', '[]'::jsonb)
        )
      else jsonb_build_object('stations', '[]'::jsonb)
    end,
    true
  ),
  updated_at = now()
where key = 'online_ordering';
