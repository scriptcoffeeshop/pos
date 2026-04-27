# POS 系統架構

## 硬體

- 前台平板：Samsung Tab A11+。
- 出單機：GODEX DT2X，使用 RJ45 連接店內 AP。
- 網路：出單機使用固定內網 IP，預設規劃為 `192.168.1.100:9100`。

## 前端

- Vue 3 + Vite + TypeScript。
- 消費者線上點餐、Web POS 與 Capacitor Android APK 共用同一套 Vue build；`order.scriptcoffee.com.tw` 預設進入線上點餐，內部工作區仍可切換 POS / 後台。
- 所有互動都由 Vue component event 與 composable 管理。
- 禁止新增 inline event handler、`data-action` bridge、`window.*` API 與手動 `innerHTML` 資料渲染。
- 前台與後台共用同一個 Vue App，透過工作區切換進入線上點餐、POS、商品菜單、出單規則與權限管理；後台寫入必須經 `POS_ADMIN_PIN` 保護的 Edge Function。

## 後端

POS 會使用獨立 Supabase 專案，不沿用咖啡訂購專案的資料庫；但工程模式沿用咖啡訂購專案已驗證的 Supabase 架構：

- PostgreSQL 保存商品、訂單、會員、付款、交易日誌與列印任務。
- Deno/Hono Edge Functions 處理商業邏輯、金流回呼與訂單狀態。
- `pos-api` 對公開前台提供依 channel 過濾的商品與建單端點，對 POS 提供訂單與 runtime 出單機設定端點，對後台提供 PIN 保護的商品與設定端點。
- API log 使用結構化 JSON，保留 `scope=action-audit` 類型欄位，方便後續接 Logflare 或 Datadog。

## 整合

- LINE Login：會員登入與 profile 綁定。會員顯示名稱不可被訂單收件人姓名覆蓋。
- LINE Pay / 街口支付：線上付款與回呼。付款逾期要落到 `status=failed` 與 `payment_status=expired`。
- Capacitor TCP socket：下一步加入外掛後，平板 APK 直接連線出單機 IP，送出 EZPL。

## 初始資料流

1. 櫃台或線上來源建立訂單。
2. POS 訂單佇列即時顯示新訂單。
3. POS 依 `pos_settings.printer_settings` 選擇啟用的出單機，新訂單進入 `print_jobs`。
4. 平板透過 LAN 對 GODEX DT2X 送出列印 payload。
5. 列印成功後回寫訂單/列印任務狀態。
