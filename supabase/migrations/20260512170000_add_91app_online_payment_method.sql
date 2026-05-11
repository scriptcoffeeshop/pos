alter type public.pos_payment_method add value if not exists 'app91-card';

update public.pos_settings
set
  value = jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{paymentMethods}',
    (
      case
        when jsonb_typeof(value->'paymentMethods') = 'array'
          then value->'paymentMethods'
        else '[]'::jsonb
      end
    ) || jsonb_build_array(jsonb_build_object(
      'id', 'app91-card',
      'label', '91APP 支付線上刷卡',
      'enabled', false,
      'opensCashDrawer', false
    )),
    true
  ),
  updated_at = now()
where key = 'online_ordering'
  and not exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(value->'paymentMethods') = 'array'
          then value->'paymentMethods'
        else '[]'::jsonb
      end
    ) as method
    where method->>'id' = 'app91-card'
  );
