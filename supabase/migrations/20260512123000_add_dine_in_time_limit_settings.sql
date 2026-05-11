update public.pos_settings
set
  value = jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{dineInTimeLimit}',
    case
      when jsonb_typeof(value->'dineInTimeLimit') = 'object'
        then jsonb_build_object(
          'enabled',
          coalesce(value->'dineInTimeLimit'->'enabled' = 'true'::jsonb, false),
          'mealMinutes',
          least(greatest(
            case
              when jsonb_typeof(value->'dineInTimeLimit'->'mealMinutes') = 'number'
                then (value->'dineInTimeLimit'->>'mealMinutes')::integer
              else 120
            end,
            0
          ), 720),
          'lastOrderBeforeEndMinutes',
          least(greatest(
            case
              when jsonb_typeof(value->'dineInTimeLimit'->'lastOrderBeforeEndMinutes') = 'number'
                then (value->'dineInTimeLimit'->>'lastOrderBeforeEndMinutes')::integer
              else 0
            end,
            0
          ), 720),
          'holidayRules',
          case
            when jsonb_typeof(value->'dineInTimeLimit'->'holidayRules') = 'array'
              then value->'dineInTimeLimit'->'holidayRules'
            else '[]'::jsonb
          end
        )
      else jsonb_build_object(
        'enabled', false,
        'mealMinutes', 120,
        'lastOrderBeforeEndMinutes', 0,
        'holidayRules', '[]'::jsonb
      )
    end,
    true
  ),
  updated_at = now()
where key = 'online_ordering';
