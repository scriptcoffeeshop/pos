update public.pos_settings
set
  value = jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{dineInCheckout}',
    jsonb_build_object(
      'mode',
      case
        when value->'dineInCheckout'->>'mode' = 'prepaid' then 'prepaid'
        else 'postpaid'
      end
    ),
    true
  ),
  updated_at = now()
where key = 'online_ordering';
