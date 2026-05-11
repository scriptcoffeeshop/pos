insert into public.pos_settings (key, value)
values (
  'engagement_settings',
  '{
    "workflowAlerts": {
      "scheduledPickupReminderEnabled": false,
      "waitlineWaitWarningEnabled": false,
      "waitlineWaitWarningMinutes": 30,
      "dineInUnprintedWarningEnabled": false,
      "dineInUnprintedWarningMinutes": 15,
      "dineInFulfillmentWarningEnabled": false,
      "dineInFulfillmentWarningMinutes": 15,
      "dineInDwellWarningEnabled": false,
      "dineInDwellWarningMinutes": 120,
      "takeoutUnprintedWarningEnabled": false,
      "takeoutUnprintedWarningMinutes": 15,
      "takeoutFulfillmentWarningEnabled": false,
      "takeoutFulfillmentWarningMinutes": 15,
      "takeoutWaitWarningEnabled": false,
      "takeoutWaitWarningMinutes": 15
    }
  }'::jsonb
)
on conflict (key) do update
set value = jsonb_set(
  coalesce(public.pos_settings.value, '{}'::jsonb),
  '{workflowAlerts}',
  '{
    "scheduledPickupReminderEnabled": false,
    "waitlineWaitWarningEnabled": false,
    "waitlineWaitWarningMinutes": 30,
    "dineInUnprintedWarningEnabled": false,
    "dineInUnprintedWarningMinutes": 15,
    "dineInFulfillmentWarningEnabled": false,
    "dineInFulfillmentWarningMinutes": 15,
    "dineInDwellWarningEnabled": false,
    "dineInDwellWarningMinutes": 120,
    "takeoutUnprintedWarningEnabled": false,
    "takeoutUnprintedWarningMinutes": 15,
    "takeoutFulfillmentWarningEnabled": false,
    "takeoutFulfillmentWarningMinutes": 15,
    "takeoutWaitWarningEnabled": false,
    "takeoutWaitWarningMinutes": 15
  }'::jsonb || coalesce(public.pos_settings.value->'workflowAlerts', '{}'::jsonb),
  true
);
