# 開發交接紀錄

更新日期：2026-04-29

## 目前狀態

- 專案位置：`/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/POS`
- 技術基底：Vue 3 + Vite + TypeScript。
- 初始畫面：門市 POS 工作台，包含菜單、購物車、付款、訂單佇列與列印站狀態；`order.scriptcoffee.com.tw` 會預設進入消費者線上點餐頁。
- 櫃台效率操作：POS 工作台已改為「點餐、訂單、列印、班別」頁籤，起始畫面固定為點餐；已有最近/常用品項快速加購並跨重啟保留、常用備註 chip、未送出櫃台草稿自動恢復、待處理/可交付/全部佇列篩選、付款狀態篩選、訂單搜尋與篩選狀態跨重啟保留、訂單明細展開、訂單左滑作廢/退款、列印單左滑刪除、庫存/低庫存提示、下單原子扣庫存、多平板訂單鎖定、收款確認、未收款訂單作廢、已收款退款沖銷、列印重印紀錄、正式開班/關班、關帳摘要、關帳異常檢查與強制確認、鍵盤捷徑；建立櫃台訂單後會清空購物車並重置顧客電話/備註，避免帶到下一張單。
- 前端資料流：`src/lib/posApi.ts` 是唯一 POS API client，負責把 Supabase Edge Function snake_case 回應轉成 Vue view model；`usePosSession()` 只處理畫面狀態與 fallback。
- 後台入口：`src/components/AdminPanel.vue` 管理商品菜單、庫存數量、低庫存門檻、暫停供應至、POS/線上/掃碼可見性、備餐站、會員錢包與 CSV 匯出、營運日報與 CSV 匯出、金流回呼事件篩選/匯出、出單機規則、角色權限、平板在線與操作稽核匯出；讀取金流事件、稽核、平板狀態與寫入設定需 Supabase secret `POS_ADMIN_PIN`。
- 品牌素材：`public/assets/script-coffee-logo.png` 來自本機 `SC/logo.png`。
- GitHub repo：`scriptcoffeeshop/pos`，目前為 public。
- Git remote：`git@github-scriptcoffeeshop:scriptcoffeeshop/pos.git`。
- SSH 綁定：repo-local `core.sshCommand=ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes`。
- 第一次 CI：GitHub Actions run `25003328938`，`verify` job 已通過；Pages deploy job 後續已改為 `main` push 自動部署。
- 後端決策：POS 使用獨立 Supabase 專案 `uuzwcmceotooocyrtnao`，不沿用咖啡訂購專案的資料庫。
- 本機 env：`.env.local` 與 `.env.supabase.local` 已建立並被 `.gitignore` 保護，不提交真實值。
- GitHub Secrets / Variables：已設定 Supabase deploy 需要的 secrets 與前端 build variables。
- Pages 網域：`order.scriptcoffee.com.tw` 已綁定 GitHub Pages；2026-04-28 使用者回報 HTTPS 已完成。
- 遠端部署：`20260427155000_initial_pos_schema.sql` 已推到 Supabase；`pos-api` Edge Function 已部署並通過 `/health`、`/products` 驗證。
- POS API 同步：商品、訂單、runtime 出單機設定與收銀班別會從 `/products?channel=pos`、`/orders`、`/settings/runtime`、`/register/current` 載入；消費者線上菜單讀 `/products?channel=online`；櫃台與線上建單都走 `POST /orders`，後端用 `create_pos_order()` 在同一個 transaction 建單、寫品項與扣庫存，並保存希望取餐/送達時間與外送地址；`GET /orders` 會把超過 `POS_PAYMENT_EXPIRY_MINUTES`（預設 20 分鐘）的線上/QR 待付款新單自動改成 `status=failed`、`payment_status=expired`；平板接單先走 `POST /orders/:id/claim`，收款確認走 `PATCH /orders/:id/payment`，未收款作廢走 `POST /orders/:id/void`，已收款退款走 `POST /orders/:id/refund`，訂單狀態走 `PATCH /orders/:id/status`，列印工作會依後台規則拆成多筆 `POST /print-jobs`，列印單刪除走 `DELETE /print-jobs/:id`。POS 啟動後每 20 秒短輪詢 `/orders` 與 `/register/current`，每 30 秒送 `/station/heartbeat`，平板回到前景時也會補同步一次；API 失敗建立的櫃台單會保存到 `script-coffee-pos-pending-orders`，佇列會標示「本機待同步」，後續同步成功時先補寫遠端並去重。
- 商品庫存欄位：`products.inventory_count`、`low_stock_threshold`、`sold_out_until` 由 `20260429110000_add_product_inventory_controls.sql` 新增；前端仍保留 `is_available` 作為人工上架/停售開關，庫存為 0 或暫停到期前會在 POS 端視為不可點。
- 下單扣庫存：`20260429150000_add_create_pos_order_function.sql` 新增 `create_pos_order()`，`POST /orders` 會透過 DB function 原子建單與扣庫存；庫存不足時整筆 rollback，POS 會移除暫存單並把品項還回購物車。
- 外送/履約欄位：`20260429161000_add_order_fulfillment_fields.sql` 新增 `orders.delivery_address` 與 `requested_fulfillment_at`，線上與櫃台建單都會寫入，POS 佇列與收據 payload 會顯示希望時間與地址。
- 多平板鎖定欄位：`orders.claimed_by`、`claimed_at`、`claim_expires_at` 由 `20260429123000_add_order_claim_lease.sql` 新增；`pos-api` 只允許未鎖定、本機持有或已逾時的進行中訂單取得 claim，已交付/失敗/作廢單不可再 claim，狀態更新、收款與 print job 建立前都會檢查 lease，已交付/異常單會釋放 lease。
- 收銀班別欄位：`register_sessions` 由 `20260429133000_add_register_sessions.sql` 新增；`pos-api` 提供 `/register/current`、`/register/open`、`/register/close`，開班/關班寫入需 `POS_ADMIN_PIN`。
- 關帳異常欄位：`register_sessions.open_order_count`、`failed_payment_count`、`failed_print_count`、`voided_order_count` 由 `20260429140500_add_register_closeout_exception_counts.sql` 新增；開班中的 `/register/current` 會動態重算，關班時會保存快照。有未交付、付款異常或列印失敗時，`/register/close` 需送 `force=true` 才能關班。
- 操作稽核：`pos_audit_events` 由 `20260429142000_add_pos_audit_events.sql` 新增；`pos-api` 會記錄建單、claim、釋放、狀態更新、收款、付款逾期、退款、作廢、商品/設定異動、會員建立、錢包調整、開班與關班事件。商品異動會寫入庫存、低庫存門檻、售價、上下架與暫停供應的前後值/差額，並提供 PIN 保護的 `/admin/audit-events` 供後台追帳與排錯。
- 會員錢包：`20260429154000_add_member_wallet_functions.sql` 新增 `create_pos_member()` 與 `adjust_pos_member_wallet()`；後台 `GET/POST /admin/members` 可建立/查詢會員，`POST /admin/members/:id/wallet-adjustments` 會在單一 DB transaction 內更新 `members.wallet_balance` 並寫入 `transaction_ledger`。
- 金流 webhook：`20260429172000_add_payment_webhook_events.sql` 新增 `payment_events` 與 `record_pos_payment_event()`；`POST /payments/webhook/:provider` 需 `POS_PAYMENT_WEBHOOK_SECRET`，以 provider + event id 做冪等，金額不符只記錄不改單，已付款訂單不會被失敗/逾期回呼降級，退款回呼會寫負數交易流水。後台 `GET /admin/payment-events` 可用管理 PIN 讀最近回呼、重送與未套用事件，並支援 provider/狀態篩選與 CSV 匯出，方便正式串 LINE Pay / 街口前排錯。
- RPC 權限：`20260429183000_lock_down_pos_security_definer_rpc.sql` 撤掉 `create_pos_order()`、`refund_pos_order()`、`create_pos_member()`、`adjust_pos_member_wallet()` 與 `record_pos_payment_event()` 對 `public/anon/authenticated` 的 `EXECUTE`，只保留 `service_role`，讓外部請求固定經過 `pos-api` 的 PIN/webhook secret/輸入驗證。
- 金流事件 RLS：`20260429183500_lock_down_payment_events_rls.sql` 補上 `payment_events` 的 no-direct-client policy，避免 anon/authenticated 直接讀寫 webhook 原始事件；後台查詢仍固定走 `pos-api` service role 與管理 PIN。
- 營運日報：`GET /admin/reports/daily?date=YYYY-MM-DD` 依台灣日界線彙總當日訂單，回傳實收、待收、退款、異常、付款方式、訂單來源、服務方式、時段分布與熱門商品；後台報表頁直接讀此端點。
- 退款沖銷：`20260429143000_add_refunded_payment_status.sql` 新增 `payment_status=refunded`；`20260429143500_add_refund_pos_order_function.sql` 新增 `refund_pos_order()`，讓退款在同一個資料庫 transaction 內更新訂單並寫入 `transaction_ledger`。
- 平板心跳：`pos_station_heartbeats` 由 `20260429144500_add_pos_station_heartbeats.sql` 新增；POS 工作台每 30 秒 upsert 一次，後台 `/admin/stations` 可看最後在線時間。
- 平板測試：`rtk npm run tablet:url` 會輸出同 Wi-Fi 平板可開啟的本機網址；瀏覽器版不能直連 TCP 出單機。
- APK 測試：已加入 Capacitor Android 專案、`Android APK` workflow 與 Android `LanPrinter` TCP socket plugin；本機 `rtk npm run apk:debug` 會先同步 Capacitor，並在 macOS arm64 JDK 崩潰時自動改用暫存 x86_64 Temurin 21 建置。
- 列印計畫：`src/lib/printing.ts` 會依 `printer_settings` 的服務方式、品項分類、貼紙/收據模式與 copies 建立多筆 EZPL payload；列印站 healthcheck 會分離畫面預覽與實際 EZPL payload，`usePosSession()` 逐筆建立/回寫 print job，列印頁會列出 print jobs 並可滑動刪除，Android APK 逐筆送 TCP。
- 本機驗證：2026-04-28 已跑 `rtk npm run ci-local` 通過；`rtk npm run pages:check` 在 Codex 沙盒內因 `dig` socket 與 GitHub API 網路限制無法二次驗證 HTTPS，需以一般終端、GitHub Pages UI 或 GitHub Actions 為準。

## 來源藍圖

參考文件：`/Users/kimi/Downloads/POS 系統藍圖更新：區域網路列印版.pdf`

藍圖重點：

- Samsung Tab A11+ 作為前台 POS 平板。
- GODEX DT2X 透過 RJ45 接店內 AP，固定內網 IP，例如 `192.168.1.100`。
- Web POS 使用 Vue 3 + Vite SFC，原始網頁部署到 GitHub Pages。
- Android 平板版本使用 Capacitor 封裝成 APK，debug APK 測試流程見 `docs/android-apk.md`。
- 區網列印用 Android `LanPrinter` Capacitor native plugin 繞過瀏覽器對本地 IP 的限制，直接送 EZPL 到出單機。
- 後端採 Supabase PostgreSQL + Deno/Hono Edge Functions。
- 外部整合包含 LINE Login、LINE Pay、街口支付。

## 沿用咖啡訂購專案的經驗

- 文件要分層：`README.md` 放人類可操作的入口，`DEV_CONTEXT.md` 放交接脈絡，長期規劃放 `docs/`。
- CI 要阻擋容易回到 legacy 的前端模式，所以這裡加入 `scripts/check_frontend_guardrails.py`。
- 表單與付款狀態要在使用者互動邊界就清楚建模，不只靠後端拒絕。
- 未來接 Supabase 時，資料流要從 API 回應、共享 types、view model 到 Vue template 一次打通。
- 金鑰與部署憑證只放 `.env.local`、GitHub Secrets 或 Supabase Secrets。

## 下一步

1. 在 Samsung Tab A11+ 安裝最新版 debug APK，對 GODEX DT2X 做 healthcheck label、櫃台訂單列印與關班流程實測。
2. 多平板鎖定後續：短輪詢與平板在線心跳已接第一版；若需要更低延遲，再接 Supabase realtime。
3. 接 LINE Login / LINE Pay / 街口支付時，把 provider 簽章驗證與 payload mapping 接到既有 `/payments/webhook/:provider` 契約，並用後台「支付事件」追查重送、金額不符與未套用回呼。
