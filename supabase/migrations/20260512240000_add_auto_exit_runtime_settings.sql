insert into public.pos_settings (key, value)
values (
  'engagement_settings',
  '{
    "workflowAlerts": {
      "dineInAutoExitEnabled": false,
      "takeoutAutoExitEnabled": true
    }
  }'::jsonb
)
on conflict (key) do update
set value = jsonb_set(
  coalesce(public.pos_settings.value, '{}'::jsonb),
  '{workflowAlerts}',
  '{
    "dineInAutoExitEnabled": false,
    "takeoutAutoExitEnabled": true
  }'::jsonb || coalesce(public.pos_settings.value->'workflowAlerts', '{}'::jsonb),
  true
);
