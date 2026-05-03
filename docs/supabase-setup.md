# Supabase 新專案設定

POS 後端資料庫會建立獨立 Supabase 專案，避免與咖啡訂購專案共享資料表、金流狀態或會員資料。

目前綁定 project ref：`uuzwcmceotooocyrtnao`。

## 建立後需要回填的資訊

前端 `.env.local`：

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_POS_STORE_ID=sc-main
VITE_POS_PRINTER_HOST=192.168.1.100
VITE_POS_PRINTER_PORT=9100
```

後端部署 `.env.supabase.local`：

```bash
SUPABASE_PROJECT_REF=<project-ref>
SUPABASE_ACCESS_TOKEN=<personal-access-token>
SUPABASE_DB_PASSWORD=<database-password>
```

正式部署時，後端三項請放 GitHub Secrets，不要提交到 git。

## 初始 schema 草案

- `products`：商品、自訂文字分類、售價、上架狀態、POS/線上/掃碼可見性、備餐站、標籤列印設定與庫存。
- `pos_settings`：出單機/印單規則、角色權限與線上點餐 runtime 等後台設定。
- `orders`：訂單主檔、來源、服務方式、希望取餐/送達時間、外送地址、付款狀態、製作狀態。
- `order_items`：訂單品項、數量、單價、客製選項。
- `members`：LINE Login profile 與會員錢包摘要，後台可先建立手動會員，未來再綁定 LINE UID。
- `transaction_ledger`：儲值、扣款、退款與調帳流水；POS 已收款退款會寫入負數 refund entry。
- `payment_events`：外部金流 webhook 事件，以 provider + event id 做冪等。
- `print_jobs`：列印 payload、出單機、重試次數、列印結果。
- `register_sessions`：收銀開班/關班、開班現金、實點現金、預期現金、付款彙總與待收款。
- `pos_audit_events`：POS 關鍵操作事件，包含建單、訂單 claim、釋放、狀態更新、收款、付款逾期、退款、作廢、商品/設定異動、會員建立、錢包調整、開班與關班；商品稽核會保存庫存/售價等欄位的前後值與差額，並由後台以 PIN 查詢。
- `pos_station_heartbeats`：平板工作站在線狀態，保存 station id、顯示名稱、平台與最後心跳。

## 邊界

- 會員 LINE profile 名稱固定保存，不被訂單收件人姓名覆蓋。
- 線上/QR 待付款新單會在 `GET /orders` 時依 `POS_PAYMENT_EXPIRY_MINUTES`（預設 20 分鐘）自動寫入 `status=failed` 與 `payment_status=expired`。
- `create_pos_order()`、`refund_pos_order()`、`create_pos_member()`、`adjust_pos_member_wallet()` 與 `record_pos_payment_event()` 是 `SECURITY DEFINER` 交易函式，只授權 `service_role` 執行；外部請一律走 `pos-api` Edge Function，不從 anon/authenticated REST RPC 直呼。
- API log 使用結構化 JSON，保留 `scope=action-audit` 類型欄位。

## 已部署項目

- Migration：`20260427155000_initial_pos_schema.sql`
- Advisor 修正：`20260427161000_fix_advisor_security_warnings.sql`
- Admin 設定擴充：`20260428102000_add_pos_admin_settings.sql`
- 外送出單規則補強：`20260428193000_add_delivery_print_rule.sql`
- 商品庫存控管：`20260429110000_add_product_inventory_controls.sql`
- 多平板訂單鎖定：`20260429123000_add_order_claim_lease.sql`
- 收銀班別：`20260429133000_add_register_sessions.sql`
- 訂單作廢狀態：`20260429135000_add_voided_order_status.sql`
- 關帳異常計數：`20260429140500_add_register_closeout_exception_counts.sql`
- 操作稽核：`20260429142000_add_pos_audit_events.sql`
- 退款狀態：`20260429143000_add_refunded_payment_status.sql`
- 退款交易函式：`20260429143500_add_refund_pos_order_function.sql`
- 平板心跳：`20260429144500_add_pos_station_heartbeats.sql`
- 原子建單扣庫存：`20260429150000_add_create_pos_order_function.sql`
- 會員錢包交易函式：`20260429154000_add_member_wallet_functions.sql`
- 訂單履約欄位：`20260429161000_add_order_fulfillment_fields.sql`
- 金流 webhook 事件：`20260429172000_add_payment_webhook_events.sql`
- SECURITY DEFINER RPC 執行權收斂：`20260429183000_lock_down_pos_security_definer_rpc.sql`
- 金流 webhook 事件 RLS policy：`20260429183500_lock_down_payment_events_rls.sql`
- 線上點餐 runtime 設定：`20260503001500_add_online_ordering_settings.sql`
- 商品分類放寬為自訂文字：`20260503163000_make_product_categories_custom.sql`
- Edge Function：`pos-api`
- 驗證端點：`/functions/v1/pos-api/health`
- 商品端點：`/functions/v1/pos-api/products`
- 訂單端點：`/functions/v1/pos-api/orders`
- 付款狀態端點：`/functions/v1/pos-api/orders/:id/payment`
- 未收款作廢端點：`/functions/v1/pos-api/orders/:id/void`
- 已收款退款端點：`/functions/v1/pos-api/orders/:id/refund`
- 金流 webhook 端點：`/functions/v1/pos-api/payments/webhook/:provider`
- 狀態更新端點：`/functions/v1/pos-api/orders/:id/status`
- 平板鎖定端點：`/functions/v1/pos-api/orders/:id/claim`
- 平板釋放端點：`/functions/v1/pos-api/orders/:id/release-claim`
- 列印工作端點：`/functions/v1/pos-api/print-jobs`、`/functions/v1/pos-api/print-jobs/:id`
- 收銀班別端點：`/functions/v1/pos-api/register/current`
- 開班端點：`/functions/v1/pos-api/register/open`
- 關班端點：`/functions/v1/pos-api/register/close`
- 後台商品端點：`/functions/v1/pos-api/admin/products`、`/functions/v1/pos-api/admin/products/:id`
- 後台會員端點：`/functions/v1/pos-api/admin/members`
- 後台錢包調整端點：`/functions/v1/pos-api/admin/members/:id/wallet-adjustments`
- 後台營運日報端點：`/functions/v1/pos-api/admin/reports/daily`
- Runtime 設定端點：`/functions/v1/pos-api/settings/runtime`
- 後台設定端點：`/functions/v1/pos-api/admin/settings`
- 後台稽核端點：`/functions/v1/pos-api/admin/audit-events`
- 後台支付事件端點：`/functions/v1/pos-api/admin/payment-events`
- 平板心跳端點：`/functions/v1/pos-api/station/heartbeat`
- 後台平板端點：`/functions/v1/pos-api/admin/stations`

## 前端同步邊界

- `src/lib/posApi.ts` 負責把 Edge Function 的 snake_case 回應轉成 `src/types/pos.ts` 的 camelCase view model。
- `src/composables/usePosSession.ts` 啟動時會嘗試載入 `/products`、`/orders`、`/settings/runtime` 與 `/register/current`；成功時以 Supabase 為準，失敗時保留本機 fallback，避免門市 POS 無法操作。消費者線上點餐頁也會讀 `/settings/runtime` 的 `online_ordering`，用來顯示接單狀態、平均備餐時間並阻擋暫停時送單。
- POS 工作台會每 20 秒短輪詢 `/orders`、`/settings/runtime` 與 `/register/current`，用最新 `online_ordering` 設定顯示線上/掃碼新單未確認提醒；平板回到前景時也會補同步一次。API 失敗建立的櫃台單會保存到本機 `script-coffee-pos-pending-orders`，後續同步成功時先補寫遠端並去重。手動刷新才會重新載入商品。
- `GET /orders` 會先清理逾時線上/QR 待付款新單，並寫入 `order.payment.expired` 稽核事件；已被平板有效 claim 的訂單不會被逾期清理。
- POS 工作台會每 30 秒送 `POST /station/heartbeat`，後台 `GET /admin/stations` 需 `X-POS-ADMIN-PIN`，用來排查多平板在線與鎖單問題。
- 櫃台建立訂單時會先建立本機訂單，再寫入 `POST /orders`；後端用 `create_pos_order()` 在同一個 transaction 建單、寫入希望取餐/送達時間、外送地址、品項並扣 `products.inventory_count`。若庫存不足，整筆 rollback，前端會移除暫存單並把品項還回購物車。若有符合 runtime 出單規則的啟用自動列印站，會依貼紙/收據/copies 拆分多筆 `POST /print-jobs`。
- 平板處理遠端訂單時會先寫入 claim lease；claim 只允許未鎖定、本機持有或已逾時的進行中訂單，已交付/失敗/作廢單不可再接手。`PATCH /orders/:id/status`、`PATCH /orders/:id/payment` 與 `POST /print-jobs` 都會帶 station id，後端拒絕未持有 lease 或被其他平板持有的寫入。
- 收款確認會走 `PATCH /orders/:id/payment` 並帶 station id；後端同樣檢查 claim lease，避免兩台平板同時改同一張單的付款狀態。
- 未收款作廢會走 `POST /orders/:id/void`，需 `X-POS-ADMIN-PIN` 與有效 claim lease；只允許 `payment_status=pending` 的訂單作廢。
- 已收款退款會走 `POST /orders/:id/refund`，需 `X-POS-ADMIN-PIN` 與有效 claim lease；只允許 `payment_status=authorized|paid`，後端以 `refund_pos_order()` 在同一個 transaction 更新訂單、寫入 `transaction_ledger`，並回傳 `payment_status=refunded`。
- 外部金流回呼走 `POST /payments/webhook/:provider`，需 `X-POS-PAYMENT-WEBHOOK-SECRET`。後端以 `record_pos_payment_event()` 寫入 `payment_events` 並做冪等狀態轉換；重複 event 不會二次入帳，金額不符不會改單，退款回呼會寫入負數 `transaction_ledger`。
- 收銀班別讀取走 `GET /register/current`；開班與關班走 `POST /register/open`、`POST /register/close`，需在 request header 帶 `X-POS-ADMIN-PIN`。
- 收銀班別摘要會回傳未交付、付款異常、列印失敗與作廢單計數；開班中的摘要動態重算，關班時會寫回 `register_sessions` 作為當班快照。有未交付、付款異常或列印失敗時，`POST /register/close` 需帶 `force=true` 才會關班。
- 後台商品管理走 `GET /admin/products`、`POST /admin/products`、`PATCH /admin/products/:id` 與 `DELETE /admin/products/:id`，需在 request header 帶 `X-POS-ADMIN-PIN`；`products.category` 已改為 text，因此工具箱可新增/刪除自訂分類並建立新品項。
- 後台會員錢包走 `GET /admin/members`、`POST /admin/members` 與 `POST /admin/members/:id/wallet-adjustments`，需 `X-POS-ADMIN-PIN`；建立會員與錢包調整都會同步寫入 `transaction_ledger` 與操作稽核。
- 後台營運日報走 `GET /admin/reports/daily?date=YYYY-MM-DD`，需 `X-POS-ADMIN-PIN`，以台灣日界線即時計算當日營收、付款方式、來源、服務方式、時段與熱門商品。
- 後台出單機、權限與線上點餐 runtime 修改走 `GET /admin/settings` 與 `PATCH /admin/settings/:key`，目前支援 `printer_settings`、`access_control`、`online_ordering`。
- 後台稽核讀取走 `GET /admin/audit-events?limit=50`，需在 request header 帶 `X-POS-ADMIN-PIN`，最多一次回傳 100 筆。
- 後台支付事件讀取走 `GET /admin/payment-events?limit=50`，需在 request header 帶 `X-POS-ADMIN-PIN`，最多一次回傳 100 筆；可用 `provider=line-pay` 之類 query 篩選 provider。

## 後台 PIN

後台寫入使用 Supabase Edge Function secret 驗證，不把管理 PIN 編進前端 bundle：

```bash
rtk supabase secrets set POS_ADMIN_PIN=<your-pin> --project-ref uuzwcmceotooocyrtnao
rtk supabase secrets set POS_PAYMENT_WEBHOOK_SECRET=<random-secret> --project-ref uuzwcmceotooocyrtnao
rtk npm run supabase:functions:deploy
```

若未設定 `POS_ADMIN_PIN`，後台會回傳 `POS_ADMIN_PIN is not configured`，前台 POS 仍可正常點餐與讀取 runtime 設定。
