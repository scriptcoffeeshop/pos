update public.pos_settings
set
  value = jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{tableQrCode}',
    jsonb_build_object(
      'theme',
      case
        when value->'tableQrCode'->>'theme' in ('black', 'green', 'orange', 'yellow', 'purple') then value->'tableQrCode'->>'theme'
        else 'black'
      end,
      'logoText',
      coalesce(nullif(value->'tableQrCode'->>'logoText', ''), 'Script Coffee'),
      'logoDataUrl',
      case
        when value->'tableQrCode'->>'logoDataUrl' like 'data:image/%' then left(value->'tableQrCode'->>'logoDataUrl', 120000)
        else ''
      end
    ),
    true
  ),
  updated_at = now()
where key = 'online_ordering';
