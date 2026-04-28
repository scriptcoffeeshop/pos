# POS 系統架構

## 硬體

- 前台平板：Samsung Tab A11+。
- 出單機：GODEX DT2X，使用 RJ45 連接店內 AP。
- 網路：出單機使用固定內網 IP，預設規劃為 `192.168.1.100:9100`。

## 前端

- Vue 3 + Vite + TypeScript。
- 消費者線上點餐與門市工作台共用同一套 Vue build，但入口責任不同：`order.scriptcoffee.com.tw` 預設進入消費者線上點餐；Capacitor Android APK 永遠進入門市 POS 工作站，不提供消費者線上點餐 view。
- 所有互動都由 Vue component event 與 composable 管理。
- 禁止新增 inline event handler、`data-action` bridge、`window.*` API 與手動 `innerHTML` 資料渲染。
- Web 內部工作區可切換 POS / 線上點餐 / 後台；APK 只保留前台點餐、線上訂單接單、立即出單與商品暫停供應等門市操作。完整商品菜單、出單規則與權限管理仍在 Web 後台，寫入必須經 `POS_ADMIN_PIN` 保護的 Edge Function。

## 後端

POS 會使用獨立 Supabase 專案，不沿用咖啡訂購專案的資料庫；但工程模式沿用咖啡訂購專案已驗證的 Supabase 架構：

- PostgreSQL 保存商品、訂單、會員、付款、交易日誌與列印任務。
- Deno/Hono Edge Functions 處理商業邏輯、金流回呼與訂單狀態。
- `pos-api` 對公開前台提供依 channel 過濾的商品與建單端點，對 POS 提供訂單與 runtime 出單機設定端點，對後台提供 PIN 保護的商品與設定端點。
- 商品資料除了人工上架/停售，也保存 `inventory_count`、`low_stock_threshold` 與 `sold_out_until`；前台以這些欄位決定低庫存提示、售完與暫停供應狀態。
- API log 使用結構化 JSON，保留 `scope=action-audit` 類型欄位，方便後續接 Logflare 或 Datadog。

## 整合

- LINE Login：會員登入與 profile 綁定。會員顯示名稱不可被訂單收件人姓名覆蓋。
- LINE Pay / 街口支付：線上付款與回呼。付款逾期要落到 `status=failed` 與 `payment_status=expired`。
- Capacitor TCP socket：Android APK 內的 `LanPrinter` native plugin 直接連線出單機 IP，送出 EZPL；GitHub Pages 瀏覽器版只做預覽與雲端 print job。消費者線上點餐只以 Web 形式提供，不包進 APK 操作介面。

## 初始資料流

1. 櫃台或線上來源建立訂單。
2. POS 訂單佇列即時顯示新訂單。
3. POS 依 `pos_settings.printer_settings` 的服務方式、品項分類、貼紙/收據模式與份數建立列印計畫。
4. 瀏覽器版建立雲端 `print_jobs` 並顯示 EZPL 預覽；Android APK 逐筆透過 LAN 對 GODEX DT2X 送出列印 payload。
5. 列印成功或失敗後回寫列印任務狀態。
6. POS 依當日訂單彙整關帳摘要，提供付款方式小計、待收款與列印異常提示；正式班別關帳需再新增 register session。
