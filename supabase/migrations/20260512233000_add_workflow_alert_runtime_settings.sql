update public.pos_settings
set value = jsonb_set(
  value,
  '{workflowAlerts}',
  jsonb_build_object(
    'todayOrderStartTime', '00:00',
    'todayOrderEndTime', '23:59',
    'fulfillmentDueSoonMinutes', 15,
    'defaultTakeoutPickupMinutes', 5,
    'takeoutLoopEnabled', false
  ) || coalesce(value -> 'workflowAlerts', '{}'::jsonb),
  true
)
where key = 'engagement_settings';
