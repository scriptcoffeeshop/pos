update public.pos_settings
set
  value = jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{commentFields}',
    jsonb_build_object(
      'itemNotes',
      case
        when value->'commentFields'->>'itemNotes' = 'hidden' then 'hidden'
        else 'shown'
      end,
      'orderNote',
      case
        when value->'commentFields'->>'orderNote' in ('hidden', 'required') then value->'commentFields'->>'orderNote'
        else 'optional'
      end,
      'orderNotePlaceholder',
      coalesce(nullif(value->'commentFields'->>'orderNotePlaceholder', ''), '甜度、冰量或其他需求')
    ),
    true
  ),
  updated_at = now()
where key = 'online_ordering';
