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

- `products`：商品、分類、售價、上架狀態。
- `orders`：訂單主檔、來源、服務方式、付款狀態、製作狀態。
- `order_items`：訂單品項、數量、單價、客製選項。
- `members`：LINE Login profile 與會員錢包摘要。
- `transaction_ledger`：儲值、扣款、退款與調帳流水。
- `print_jobs`：列印 payload、出單機、重試次數、列印結果。

## 邊界

- 會員 LINE profile 名稱固定保存，不被訂單收件人姓名覆蓋。
- 線上付款逾期需要自動寫入 `status=failed` 與 `payment_status=expired`。
- API log 使用結構化 JSON，保留 `scope=action-audit` 類型欄位。

## 已部署項目

- Migration：`20260427155000_initial_pos_schema.sql`
- Advisor 修正：`20260427161000_fix_advisor_security_warnings.sql`
- Edge Function：`pos-api`
- 驗證端點：`/functions/v1/pos-api/health`
- 商品端點：`/functions/v1/pos-api/products`
