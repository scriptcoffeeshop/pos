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
- Web 內部工作區可切換 POS / 線上點餐 / 後台；APK 只保留前台點餐、線上訂單接單、立即出單與商品暫停供應等門市操作。完整商品菜單、出單規則與權限管理需先在前端連點工具箱 6 下進入後台編輯模式。
- POS 工作台會訂閱 Supabase Realtime invalidation event，讓訂單佇列、runtime 設定、收銀班別與商品供應變更先由事件觸發重新載入；每 20 秒短輪詢仍保留為斷線 fallback，平板回到前景時也會立即補同步一次，避免多平板 claim lease 釋放或逾時後仍顯示舊狀態。Android APK 背景或熄屏後由 `OnlineOrderNotifier` native plugin 依 `online_ordering` runtime 短輪詢 `/settings/runtime` 與 `/orders`，用系統 notification 和原生 tone 補上線上/掃碼新單提醒；Web 背景只提供 Browser Notification API fallback。API 失敗建立的櫃台單會先存在平板本機，後續同步成功時補寫 Supabase 並以訂單編號去重。

## 後端

POS 會使用獨立 Supabase 專案，不沿用咖啡訂購專案的資料庫；但工程模式沿用咖啡訂購專案已驗證的 Supabase 架構：

- PostgreSQL 保存商品、訂單、會員、付款、交易日誌、列印任務與收銀班別。
- Deno/Hono Edge Functions 處理商業邏輯、金流回呼與訂單狀態。
- `pos-api` 對公開前台提供依 channel 過濾的商品與建單端點，對 POS 提供櫃台草稿單、正式化建單、收款確認、未收款作廢與 runtime 出單機/線上點餐設定端點，對後台提供商品與設定端點；讀取訂單時會自動將逾時的線上/QR 待付款新單標成付款逾期，線上/QR 建單也會遵守 `online_ordering` 的接單與預約開關。
- `pos_realtime_events` 是前端唯一直接訂閱的 Realtime 表；`orders`、`pos_settings`、`register_sessions` 與 `products` trigger 只寫入低敏感 topic/event/entity payload，POS 與線上點餐收到事件後仍回到 `pos-api` 取得正式資料，不直接訂閱受保護的來源表。
- 會員錢包由 `members.wallet_balance` 保存摘要，所有儲值/扣款走 `transaction_ledger`；後台 API 透過 DB function 在同一個 transaction 更新餘額與流水，避免兩者不一致。
- 商品資料除了人工上架/停售，也保存 `inventory_count`、`low_stock_threshold` 與 `sold_out_until`；前台以這些欄位決定低庫存提示、售完與暫停供應狀態，建單時由 `create_pos_order()` 原子扣庫存。
- 訂單主檔保存 `requested_fulfillment_at`、`delivery_address` 與櫃台草稿 `draft_lines`，讓外送地址、希望取餐/送達時間與未出單購物車能跨平板追溯，而不是只混在備註或 localStorage 裡。
- 訂單保存 `claimed_by`、`claimed_at`、`claim_expires_at` 作為多平板 claim lease；POS 改狀態或建立 `print_jobs` 前必須持有有效 lease，避免兩台平板同時出單或處理同一張訂單。
- 平板工作站每 30 秒 upsert `pos_station_heartbeats`，後台可查最後在線時間，輔助排查 claim lease 佔用與門市設備狀態。
- 收銀班別保存在 `register_sessions`；POS 可讀目前班別摘要，開班/關班需前端後台編輯模式，關班時由 Edge Function 依班別時間彙總現金、非現金、待收款、單數、未交付、付款異常、列印失敗與作廢單，並排除 `failed` / `voided` 訂單的銷售額。有未交付、付款異常或列印失敗時，關班必須送 `force=true`。
- 營運日報由 `pos-api` 以 service role 讀取當日 `orders`、`order_items` 與 `print_jobs` 即時計算，不另建快照表；目前依台灣日界線彙總實收、待收、退款、異常、付款方式、來源、服務方式、時段與熱門商品。
- `pos_audit_events` 保存 POS 關鍵操作事件；建單、claim、釋放、狀態更新、收款、付款逾期、退款、作廢、商品/設定異動、會員建立、錢包調整、開班與關班都由 Edge Function 以 service role 寫入。商品稽核會附上庫存、低庫存門檻、售價、上下架與暫停供應的前後值/差額，後台透過 `/admin/audit-events` 讀取，前端不能直接改。
- 金流 webhook 先落在 provider-neutral 契約：`payment_events(provider, event_id)` 保證冪等，`record_pos_payment_event()` 在同一個 transaction 內決定是否更新訂單付款狀態、釋放 claim lease 與寫入交易流水；後台以 `/admin/payment-events` 顯示最近回呼、重送與未套用原因。
- 已收款退款由 `refund_pos_order()` 處理，單一資料庫 transaction 會把訂單改成 `status=voided`、`payment_status=refunded`，並寫入 `transaction_ledger.entry_type=refund` 的負數流水。
- API log 使用結構化 JSON，保留 `scope=action-audit` 類型欄位，方便後續接 Logflare 或 Datadog。

## 整合

- LINE Login：會員登入與 profile 綁定。會員顯示名稱不可被訂單收件人姓名覆蓋。
- LINE Pay / 街口支付：線上付款與回呼。付款逾期會落到 `status=failed` 與 `payment_status=expired`，正式 provider adapter 需先驗簽，再 mapping 到 `/payments/webhook/:provider` 的冪等契約。
- Capacitor native plugins：Android APK 內的 `LanPrinter` native plugin 直接連線出單機 IP，送出 EZPL；`OnlineOrderNotifier` native plugin 在背景處理線上/掃碼新單 notification、提示音、稍後提醒與已讀同步。GitHub Pages 瀏覽器版只做預覽、雲端 print job 與 Browser Notification fallback。消費者線上點餐只以 Web 形式提供，不包進 APK 操作介面。

## 前端同步邊界

- `src/lib/posApi.ts` 仍是唯一正式資料入口，負責呼叫 `pos-api` 並把 snake_case 回應轉成 Vue view model。
- `src/lib/posRealtime.ts` 只建立瀏覽器端 Supabase Realtime client，訂閱 `pos_realtime_events` 的 `INSERT`。事件只作為 invalidation signal，不承載完整訂單、商品或設定資料。
- `usePosSession()` 訂閱 `orders`、`runtime_settings`、`register_sessions` 與 `products` topic；收到事件會 debounce 後重新呼叫 `/orders`、`/settings/runtime`、`/register/current` 或 `/products`。POS 商品列表以 `pos_visible` 為同步邊界，因此 `is_available=false` 的停售品項仍會回到前端反灰顯示並可從供應狀態恢復；線上/QR 商品查詢仍由 API 過濾不可售品項。若正在建單、出單、claim、收款、作廢或退款，訂單同步會延後重試，避免背景更新踩到操作中的狀態。
- Realtime 狀態為 `CHANNEL_ERROR`、`TIMED_OUT` 或 `CLOSED` 時，前端會以 2 秒到 30 秒退避重連並立即補同步一次；原本的 20 秒 POS polling、15 秒線上點餐 polling、前景補同步與 30 秒 station heartbeat 都保留。

## 初始資料流

1. 櫃台來源先建立 Supabase 草稿單並持續更新 `draft_lines`；正式結帳/出單或線上來源建單時，後端在同一個資料庫 transaction 寫入正式品項並扣庫存，庫存不足則整筆 rollback。
2. 來源表 trigger 寫入 `pos_realtime_events`，POS 平板收到 `orders` event 後重新拉取 `/orders`，線上新單提醒、claim lease 釋放與狀態更新不用等待下一輪 polling。
3. POS 平板每 20 秒仍會 fallback 同步訂單佇列與班別摘要；操作中若正在建單、出單或鎖單，會略過該輪背景同步。若 Realtime 斷線，前端會以 2 秒到 30 秒退避重連，同時保留輪詢。若先前有本機待同步櫃台單，會先嘗試補寫遠端再載入佇列。
4. POS 平板先對訂單建立 3 分鐘 claim lease；同一張單若被其他平板持有且未逾時，前端會停用收款、出單與狀態按鈕，後端也會拒絕付款狀態、訂單狀態與 print job 寫入。
5. 收款確認會把 `pending` 或 `authorized` 更新成 `paid`，並即時刷新班別摘要。
6. 未收款訂單可在後台編輯模式下作廢成 `voided`；已收款訂單可在後台編輯模式下退款成 `payment_status=refunded`，同時寫入交易流水並排除銷售。
7. POS 依 `pos_settings.printer_settings` 的服務方式、品項分類、指定品項、貼紙/收據模式與份數建立列印計畫；未被規則納入的品項不列印。消費者頁依 `pos_settings.online_ordering` 顯示接單狀態、平均備餐時間與預約欄位。
8. 瀏覽器版建立雲端 `print_jobs` 並顯示 EZPL 預覽；Android APK 逐筆透過 LAN 對 GODEX DT2X 送出列印 payload。
9. 列印成功或失敗後回寫列印任務狀態。
10. POS 依目前 `register_sessions` 彙整開班後訂單，提供預期現金、現金銷售、非現金、待收款、單數、未交付、付款異常、列印失敗、作廢與現金差額，關班時把彙總值寫回 Supabase。
