update public.pos_settings
set value = jsonb_set(
  value,
  '{serviceCharge}',
  coalesce(value -> 'serviceCharge', jsonb_build_object(
    'enabled', coalesce((value ->> 'defaultServiceFeeRate')::integer, 0) > 0,
    'label', '服務費',
    'dineInRate', coalesce((value ->> 'defaultServiceFeeRate')::integer, 0),
    'takeoutRate', 0,
    'deliveryRate', 0,
    'discountBasis', 'before-discount',
    'excludedCategories', '[]'::jsonb,
    'excludedItemIds', '[]'::jsonb
  )),
  true
)
where key = 'engagement_settings';
