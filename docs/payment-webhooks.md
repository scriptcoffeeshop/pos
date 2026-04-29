# 金流 Webhook 契約

`pos-api` 先提供 provider-neutral webhook，正式串 LINE Pay / 街口支付時只需要把各 provider 的簽章驗證與 payload mapping 接到同一個內部契約。

## Endpoint

```bash
POST /functions/v1/pos-api/payments/webhook/:provider
```

Header：

- `Authorization: Bearer <SUPABASE_ANON_KEY>`
- `apikey: <SUPABASE_ANON_KEY>`
- `Content-Type: application/json`
- `X-POS-PAYMENT-WEBHOOK-SECRET: <POS_PAYMENT_WEBHOOK_SECRET>`

Payload：

```json
{
  "eventId": "linepay-transaction-123",
  "orderNumber": "WEB-20260429-1200ABCD",
  "paymentStatus": "paid",
  "amount": 400,
  "eventType": "payment.confirmed",
  "payload": {
    "providerRawBody": "keep original provider fields here"
  }
}
```

`orderId` can be used instead of `orderNumber`. `paymentStatus` accepts `authorized`, `paid`, `failed`, `expired`, or `refunded`.

## Idempotency

- `payment_events(provider, event_id)` is unique.
- Duplicate events return `duplicate=true` and do not change the order again.
- Amount mismatch is recorded with `reason=amount_mismatch` and does not update the order.
- `paid` can promote `pending`, `authorized`, `failed`, or `expired` orders to paid; a late paid callback can recover an expired online order.
- `failed` / `expired` can only apply while the order is `pending` or `authorized`, so an already paid order is not downgraded.
- `refunded` can only apply while the order is `authorized` or `paid`, then marks the order `voided`, releases the claim lease, and writes a refund ledger entry.

## Admin Inspection

The Web admin panel reads recent webhook rows through the PIN-protected endpoint:

```bash
GET /functions/v1/pos-api/admin/payment-events?limit=50
```

Header:

- `Authorization: Bearer <SUPABASE_ANON_KEY>`
- `apikey: <SUPABASE_ANON_KEY>`
- `X-POS-ADMIN-PIN: <POS_ADMIN_PIN>`

`limit` is clamped to 1-100. Add `provider=line-pay` or another normalized provider key to inspect one provider only. The response shows whether each event was applied, ignored as a duplicate, or recorded without changing the order, which is the first place to check when a provider retry or amount mismatch happens.

## Secret Setup

```bash
rtk supabase secrets set POS_PAYMENT_WEBHOOK_SECRET=<random-secret> --project-ref uuzwcmceotooocyrtnao
rtk npm run supabase:functions:deploy
```

Keep the real value in Supabase Secrets or a local ignored env file only. Do not commit it.
