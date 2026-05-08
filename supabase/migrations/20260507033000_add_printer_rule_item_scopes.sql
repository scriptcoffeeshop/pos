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
              jsonb_set(
                rule.item,
                '{itemIds}',
                coalesce(rule.item->'itemIds', '[]'::jsonb),
                true
              ),
              '{name}',
              to_jsonb((
                case
                  when rule.item->>'name' = '內用收據' then '內用貼紙'
                  when rule.item->>'name' = '外送收據' then '外送貼紙'
                  else coalesce(nullif(rule.item->>'name', ''), '印單規則')
                end
              )::text),
              true
            ),
            '{labelMode}',
            to_jsonb((
              case
                when rule.item->>'name' in ('內用收據', '外送收據') then 'label'
                else coalesce(nullif(rule.item->>'labelMode', ''), 'label')
              end
            )::text),
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
