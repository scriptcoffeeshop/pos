insert into public.pos_settings (key, value)
values (
  'engagement_settings',
  '{
    "orderLabels": [
      { "id": "rush", "label": "急單", "color": "#b45309" },
      { "id": "allergy", "label": "過敏", "color": "#b91c1c" },
      { "id": "vip", "label": "VIP", "color": "#0f766e" }
    ],
    "customerTypes": ["一般顧客", "常客", "VIP", "員工"],
    "defaultServiceFeeRate": 0,
    "productTotalDisplay": {
      "enabled": true,
      "excludedCategories": [],
      "excludedItemIds": []
    },
    "recommendations": [
      { "id": "retail-add-on", "trigger": "coffee", "title": "咖啡加購", "productIds": [], "enabled": true },
      { "id": "food-pairing", "trigger": "morning", "title": "早餐搭配", "productIds": [], "enabled": true }
    ],
    "translations": [
      { "locale": "en", "label": "English", "enabled": true },
      { "locale": "ja", "label": "日本語", "enabled": false }
    ],
    "hardwareDevices": [
      { "id": "scanner", "kind": "bluetooth-scanner", "name": "藍牙掃碼器", "enabled": false, "targetStationId": "" },
      { "id": "payment-qr", "kind": "payment-qr", "name": "行動支付掃碼", "enabled": false, "targetStationId": "" },
      { "id": "cash-drawer", "kind": "cash-drawer", "name": "錢櫃", "enabled": false, "targetStationId": "" },
      { "id": "ipad-qr-print", "kind": "ipad-qr-print", "name": "指定 iPad 列印 QR code", "enabled": false, "targetStationId": "" }
    ],
    "supplyRules": {
      "preOpenCheckEnabled": true,
      "allowFutureOrdersAcrossDay": true,
      "defaultPeriods": [
        { "id": "all-day", "label": "全天", "days": [1,2,3,4,5,6,0], "start": "08:00", "end": "22:00" }
      ]
    },
    "reservationWebsite": {
      "enabled": false,
      "restaurantName": "Script Coffee",
      "phone": "",
      "address": "",
      "announcement": "線上訂位送出後，門市會保留此筆訂位資訊。",
      "minPartySize": 1,
      "maxPartySize": 8,
      "slotMinutes": 30,
      "durationMinutes": 120,
      "seatHoldMinutes": 15,
      "leadMinutes": 30,
      "bookingWindowDays": 14,
      "allowTableCombinations": true,
      "onlineTableIds": [],
      "businessHours": [
        { "id": "reservation-1", "day": 1, "enabled": true, "start": "09:00", "end": "20:00" },
        { "id": "reservation-2", "day": 2, "enabled": true, "start": "09:00", "end": "20:00" },
        { "id": "reservation-3", "day": 3, "enabled": true, "start": "09:00", "end": "20:00" },
        { "id": "reservation-4", "day": 4, "enabled": true, "start": "09:00", "end": "20:00" },
        { "id": "reservation-5", "day": 5, "enabled": true, "start": "09:00", "end": "20:00" },
        { "id": "reservation-6", "day": 6, "enabled": true, "start": "09:00", "end": "20:00" },
        { "id": "reservation-0", "day": 0, "enabled": false, "start": "09:00", "end": "20:00" }
      ],
      "specialDates": []
    }
  }'::jsonb
)
on conflict (key) do nothing;

update public.pos_settings
set value = jsonb_set(
  value,
  '{productTotalDisplay}',
  coalesce(
    value->'productTotalDisplay',
    '{"enabled": true, "excludedCategories": [], "excludedItemIds": []}'::jsonb
  ),
  true
)
where key = 'engagement_settings';
