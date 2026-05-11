update public.pos_settings
set
  value = jsonb_set(
    value,
    '{sessionQrCode}',
    case
      when jsonb_typeof(value->'sessionQrCode') = 'object'
        then jsonb_strip_nulls(
          jsonb_build_object(
            'autoPrint',
            coalesce(value->'sessionQrCode'->'autoPrint' = 'true'::jsonb, false),
            'stationId',
            coalesce(value->'sessionQrCode'->>'stationId', ''),
            'logoText',
            nullif(trim(coalesce(value->'sessionQrCode'->>'logoText', '')), '')
          )
        ) || jsonb_build_object(
          'logoText',
          coalesce(nullif(trim(coalesce(value->'sessionQrCode'->>'logoText', '')), ''), 'Script Coffee')
        )
      else jsonb_build_object(
        'autoPrint', false,
        'stationId', '',
        'logoText', 'Script Coffee'
      )
    end,
    true
  ),
  updated_at = now()
where key = 'online_ordering';
