insert into public.pos_settings (key, value)
values (
  'discount_settings',
  jsonb_build_object(
    'campaigns',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'manual-discount',
        'name', '手動折扣',
        'kind', 'manual',
        'scope', 'whole-order',
        'valueType', 'amount',
        'discountValue', 0,
        'minimumSubtotal', 0,
        'enabled', true,
        'sortOrder', 1,
        'serviceModes', jsonb_build_array('dine-in', 'takeout', 'delivery'),
        'categories', '[]'::jsonb,
        'productIds', '[]'::jsonb,
        'schedule', jsonb_build_object(
          'enabled', false,
          'days', jsonb_build_array(1, 2, 3, 4, 5, 6, 0),
          'start', '00:00',
          'end', '23:59',
          'allDay', true
        ),
        'usage', jsonb_build_object(
          'posEnabled', true,
          'posAutoApply', false,
          'onlineEnabled', false,
          'requiresVerification', true
        )
      )
    )
  )
)
on conflict (key) do nothing;
