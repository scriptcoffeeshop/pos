update public.pos_settings
set value = jsonb_build_object(
  'floors',
  coalesce(value -> 'floors', '[{"id":"1F","label":"1F"}]'::jsonb),
  'activeFloorId',
  coalesce(value -> 'activeFloorId', '"1F"'::jsonb),
  'tables',
  (
    select coalesce(
      jsonb_agg(
        case
          when table_entry ? 'floorId' then table_entry
          else table_entry || '{"floorId":"1F"}'::jsonb
        end
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements(coalesce(value -> 'tables', '[]'::jsonb)) as table_entry
  ),
  'display',
  coalesce(value -> 'display', '{}'::jsonb),
  'partySizes',
  coalesce(value -> 'partySizes', '{}'::jsonb),
  'waitline',
  coalesce(value -> 'waitline', '[]'::jsonb)
)
where key = 'floor_plan';
