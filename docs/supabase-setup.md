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

- `products`：商品、分類、售價、上架狀態、POS/線上/掃碼可見性、備餐站與標籤列印設定。
- `pos_settings`：出單機/印單規則與角色權限等後台設定。
- `orders`：訂單主檔、來源、服務方式、付款狀態、製作狀態。
- `order_items`：訂單品項、數量、單價、客製選項。
- `members`：LINE Login profile 與會員錢包摘要。
- `transaction_ledger`：儲值、扣款、退款與調帳流水。
- `print_jobs`：列印 payload、出單機、重試次數、列印結果。
- `register_sessions`：收銀開班/關班、開班現金、實點現金、預期現金、付款彙總與待收款。

## 邊界

- 會員 LINE profile 名稱固定保存，不被訂單收件人姓名覆蓋。
- 線上付款逾期需要自動寫入 `status=failed` 與 `payment_status=expired`。
- API log 使用結構化 JSON，保留 `scope=action-audit` 類型欄位。

## 已部署項目

- Migration：`20260427155000_initial_pos_schema.sql`
- Advisor 修正：`20260427161000_fix_advisor_security_warnings.sql`
- Admin 設定擴充：`20260428102000_add_pos_admin_settings.sql`
- 外送出單規則補強：`20260428193000_add_delivery_print_rule.sql`
- 商品庫存控管：`20260429110000_add_product_inventory_controls.sql`
- 多平板訂單鎖定：`20260429123000_add_order_claim_lease.sql`
- 收銀班別：`20260429133000_add_register_sessions.sql`
- Edge Function：`pos-api`
- 驗證端點：`/functions/v1/pos-api/health`
- 商品端點：`/functions/v1/pos-api/products`
- 訂單端點：`/functions/v1/pos-api/orders`
- 狀態更新端點：`/functions/v1/pos-api/orders/:id/status`
- 平板鎖定端點：`/functions/v1/pos-api/orders/:id/claim`
- 平板釋放端點：`/functions/v1/pos-api/orders/:id/release-claim`
- 列印工作端點：`/functions/v1/pos-api/print-jobs`
- 收銀班別端點：`/functions/v1/pos-api/register/current`
- 開班端點：`/functions/v1/pos-api/register/open`
- 關班端點：`/functions/v1/pos-api/register/close`
- 後台商品端點：`/functions/v1/pos-api/admin/products`
- Runtime 設定端點：`/functions/v1/pos-api/settings/runtime`
- 後台設定端點：`/functions/v1/pos-api/admin/settings`

## 前端同步邊界

- `src/lib/posApi.ts` 負責把 Edge Function 的 snake_case 回應轉成 `src/types/pos.ts` 的 camelCase view model。
- `src/composables/usePosSession.ts` 啟動時會嘗試載入 `/products`、`/orders`、`/settings/runtime` 與 `/register/current`；成功時以 Supabase 為準，失敗時保留本機 fallback，避免門市 POS 無法操作。
- POS 工作台會每 20 秒短輪詢 `/orders` 與 `/register/current`，平板回到前景時也會補同步一次；手動刷新才會重新載入商品與 runtime 出單設定。
- 櫃台建立訂單時會先建立本機訂單，再寫入 `POST /orders`；若有符合 runtime 出單規則的啟用自動列印站，會依貼紙/收據/copies 拆分多筆 `POST /print-jobs`。
- 平板處理遠端訂單時會先寫入 claim lease；`PATCH /orders/:id/status` 與 `POST /print-jobs` 都會帶 station id，後端拒絕未持有 lease 或被其他平板持有的寫入。
- 收銀班別讀取走 `GET /register/current`；開班與關班走 `POST /register/open`、`POST /register/close`，需在 request header 帶 `X-POS-ADMIN-PIN`。
- 後台商品修改走 `GET /admin/products` 與 `PATCH /admin/products/:id`，需在 request header 帶 `X-POS-ADMIN-PIN`。
- 後台出單機與權限修改走 `GET /admin/settings` 與 `PATCH /admin/settings/:key`，目前支援 `printer_settings`、`access_control`。

## 後台 PIN

後台寫入使用 Supabase Edge Function secret 驗證，不把管理 PIN 編進前端 bundle：

```bash
rtk supabase secrets set POS_ADMIN_PIN=<your-pin> --project-ref uuzwcmceotooocyrtnao
rtk npm run supabase:functions:deploy
```

若未設定 `POS_ADMIN_PIN`，後台會回傳 `POS_ADMIN_PIN is not configured`，前台 POS 仍可正常點餐與讀取 runtime 設定。
