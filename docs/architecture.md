# POS 系統架構

## 硬體

- 前台平板：Samsung Tab A11+。
- 出單機：GODEX DT2X，使用 RJ45 連接店內 AP。
- 網路：出單機使用固定內網 IP，預設規劃為 `192.168.1.100:9100`。

## 前端

- Vue 3 + Vite + TypeScript。
- 第一版先部署 Web POS，Phase 2 再導入 Capacitor Android APK。
- 所有互動都由 Vue component event 與 composable 管理。
- 禁止新增 inline event handler、`data-action` bridge、`window.*` API 與手動 `innerHTML` 資料渲染。

## 後端

規劃沿用咖啡訂購專案的 Supabase 模式：

- PostgreSQL 保存商品、訂單、會員、付款、交易日誌與列印任務。
- Deno/Hono Edge Functions 處理商業邏輯、金流回呼與訂單狀態。
- API log 使用結構化 JSON，保留 `scope=action-audit` 類型欄位，方便後續接 Logflare 或 Datadog。

## 整合

- LINE Login：會員登入與 profile 綁定。會員顯示名稱不可被訂單收件人姓名覆蓋。
- LINE Pay / 街口支付：線上付款與回呼。付款逾期要落到 `status=failed` 與 `payment_status=expired`。
- Capacitor TCP socket：平板 APK 直接連線出單機 IP，送出 EZPL。

## 初始資料流

1. 櫃台或線上來源建立訂單。
2. POS 訂單佇列即時顯示新訂單。
3. 新訂單進入 `print_jobs`。
4. 平板透過 LAN 對 GODEX DT2X 送出列印 payload。
5. 列印成功後回寫訂單/列印任務狀態。
