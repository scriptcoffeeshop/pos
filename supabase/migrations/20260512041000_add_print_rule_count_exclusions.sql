update public.pos_settings
set
  value = jsonb_set(
    value,
    '{rules}',
    (
      select coalesce(
        jsonb_agg(
          jsonb_set(
            jsonb_set(
              rule.item,
              '{countExcludedCategories}',
              coalesce(rule.item->'countExcludedCategories', '[]'::jsonb),
              true
            ),
            '{countExcludedItemIds}',
            coalesce(rule.item->'countExcludedItemIds', '[]'::jsonb),
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
