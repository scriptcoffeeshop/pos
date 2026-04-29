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
- POS 工作台會每 20 秒短輪詢訂單佇列與收銀班別；平板回到前景時會立即補同步一次，避免多平板 claim lease 釋放或逾時後仍顯示舊狀態。

## 後端

POS 會使用獨立 Supabase 專案，不沿用咖啡訂購專案的資料庫；但工程模式沿用咖啡訂購專案已驗證的 Supabase 架構：

- PostgreSQL 保存商品、訂單、會員、付款、交易日誌、列印任務與收銀班別。
- Deno/Hono Edge Functions 處理商業邏輯、金流回呼與訂單狀態。
- `pos-api` 對公開前台提供依 channel 過濾的商品與建單端點，對 POS 提供訂單、收款確認、未收款作廢與 runtime 出單機設定端點，對後台提供 PIN 保護的商品與設定端點；讀取訂單時會自動將逾時的線上/QR 待付款新單標成付款逾期。
- 會員錢包由 `members.wallet_balance` 保存摘要，所有儲值/扣款走 `transaction_ledger`；後台 API 透過 DB function 在同一個 transaction 更新餘額與流水，避免兩者不一致。
- 商品資料除了人工上架/停售，也保存 `inventory_count`、`low_stock_threshold` 與 `sold_out_until`；前台以這些欄位決定低庫存提示、售完與暫停供應狀態，建單時由 `create_pos_order()` 原子扣庫存。
- 訂單主檔保存 `requested_fulfillment_at` 與 `delivery_address`，讓外送地址與希望取餐/送達時間進入正式欄位、POS 佇列與收據 payload，而不是混在備註裡。
- 訂單保存 `claimed_by`、`claimed_at`、`claim_expires_at` 作為多平板 claim lease；POS 改狀態或建立 `print_jobs` 前必須持有有效 lease，避免兩台平板同時出單或處理同一張訂單。
- 平板工作站每 30 秒 upsert `pos_station_heartbeats`，後台可查最後在線時間，輔助排查 claim lease 佔用與門市設備狀態。
- 收銀班別保存在 `register_sessions`；POS 可讀目前班別摘要，開班/關班需 `POS_ADMIN_PIN`，關班時由 Edge Function 依班別時間彙總現金、非現金、待收款、單數、未交付、付款異常、列印失敗與作廢單，並排除 `failed` / `voided` 訂單的銷售額。有未交付、付款異常或列印失敗時，關班必須送 `force=true`。
- 營運日報由 `pos-api` 以 service role 讀取當日 `orders`、`order_items` 與 `print_jobs` 即時計算，不另建快照表；目前依台灣日界線彙總實收、待收、退款、異常、付款方式、來源、服務方式、時段與熱門商品。
- `pos_audit_events` 保存 POS 關鍵操作事件；建單、claim、釋放、狀態更新、收款、付款逾期、退款、作廢、商品/設定異動、會員建立、錢包調整、開班與關班都由 Edge Function 以 service role 寫入。商品稽核會附上庫存、低庫存門檻、售價、上下架與暫停供應的前後值/差額，後台只能透過 PIN 保護的 `/admin/audit-events` 讀取，前端不能直接改。
- 金流 webhook 先落在 provider-neutral 契約：`payment_events(provider, event_id)` 保證冪等，`record_pos_payment_event()` 在同一個 transaction 內決定是否更新訂單付款狀態、釋放 claim lease 與寫入交易流水。
- 已收款退款由 `refund_pos_order()` 處理，單一資料庫 transaction 會把訂單改成 `status=voided`、`payment_status=refunded`，並寫入 `transaction_ledger.entry_type=refund` 的負數流水。
- API log 使用結構化 JSON，保留 `scope=action-audit` 類型欄位，方便後續接 Logflare 或 Datadog。

## 整合

- LINE Login：會員登入與 profile 綁定。會員顯示名稱不可被訂單收件人姓名覆蓋。
- LINE Pay / 街口支付：線上付款與回呼。付款逾期會落到 `status=failed` 與 `payment_status=expired`，正式 provider adapter 需先驗簽，再 mapping 到 `/payments/webhook/:provider` 的冪等契約。
- Capacitor TCP socket：Android APK 內的 `LanPrinter` native plugin 直接連線出單機 IP，送出 EZPL；GitHub Pages 瀏覽器版只做預覽與雲端 print job。消費者線上點餐只以 Web 形式提供，不包進 APK 操作介面。

## 初始資料流

1. 櫃台或線上來源建立訂單；後端在同一個資料庫 transaction 寫入訂單、品項並扣庫存，庫存不足則整筆 rollback。
2. POS 訂單佇列即時顯示新訂單。
3. POS 平板每 20 秒同步訂單佇列與班別摘要；操作中若正在建單、出單或鎖單，會略過該輪背景同步。
4. POS 平板先對訂單建立 3 分鐘 claim lease；同一張單若被其他平板持有且未逾時，前端會停用收款、出單與狀態按鈕，後端也會拒絕付款狀態、訂單狀態與 print job 寫入。
5. 收款確認會把 `pending` 或 `authorized` 更新成 `paid`，並即時刷新班別摘要。
6. 未收款訂單可用管理 PIN 作廢成 `voided`；已收款訂單可用管理 PIN 退款成 `payment_status=refunded`，同時寫入交易流水並排除銷售。
7. POS 依 `pos_settings.printer_settings` 的服務方式、品項分類、貼紙/收據模式與份數建立列印計畫。
8. 瀏覽器版建立雲端 `print_jobs` 並顯示 EZPL 預覽；Android APK 逐筆透過 LAN 對 GODEX DT2X 送出列印 payload。
9. 列印成功或失敗後回寫列印任務狀態。
10. POS 依目前 `register_sessions` 彙整開班後訂單，提供預期現金、現金銷售、非現金、待收款、單數、未交付、付款異常、列印失敗、作廢與現金差額，關班時把彙總值寫回 Supabase。
