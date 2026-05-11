update public.pos_settings
set
  value = jsonb_set(
    value,
    '{rules}',
    (
      select coalesce(
        jsonb_agg(
          jsonb_set(
            rule.item,
            '{timings}',
            case
              when jsonb_typeof(rule.item->'timings') = 'array'
                and jsonb_array_length(rule.item->'timings') > 0
                then rule.item->'timings'
              else '["order", "reprint"]'::jsonb
            end,
            true
          )
          order by rule.ordinality
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(coalesce(value->'rules', '[]'::jsonb)) with ordinality as rule(item, ordinality)
    ),
    true
  ),
  updated_at = now()
where key = 'printer_settings';
