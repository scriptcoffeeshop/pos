update public.pos_settings
set
  value = jsonb_set(
    value,
    '{rules}',
    coalesce(value->'rules', '[]'::jsonb) || '[
      {
        "id": "delivery-receipt",
        "name": "外送收據",
        "serviceMode": "delivery",
        "stationId": "counter",
        "categories": ["coffee", "tea", "food", "retail"],
        "copies": 1,
        "labelMode": "both",
        "enabled": true
      }
    ]'::jsonb,
    true
  ),
  updated_at = now()
where key = 'printer_settings'
  and not exists (
    select 1
    from jsonb_array_elements(coalesce(value->'rules', '[]'::jsonb)) as rule(item)
    where rule.item->>'id' = 'delivery-receipt'
  );
