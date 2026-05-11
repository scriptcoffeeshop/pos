insert into public.pos_settings (key, value)
values (
  'engagement_settings',
  '{"orderPageDisplay":{"noteColumns":3}}'::jsonb
)
on conflict (key) do update
set value = jsonb_set(
  coalesce(public.pos_settings.value, '{}'::jsonb),
  '{orderPageDisplay}',
  '{"noteColumns":3}'::jsonb || coalesce(public.pos_settings.value->'orderPageDisplay', '{}'::jsonb),
  true
);
