# 開發交接紀錄

更新日期：2026-05-05

## 目前狀態

- 專案位置：`/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/POS`
- 技術基底：Vue 3 + Vite + TypeScript。
- 初始畫面：門市 POS 工作台預設進入簡潔的「桌況頁」，固定右側導航列已移除，工具箱改為可自由拖曳的浮動入口，並保留上一版綠色主色系；主畫面可直接搜尋/篩選訂單，並用「新增外帶」進入點餐。點餐頁改為接近 iCHEF 出單畫面的左側外帶票券、右側分類列與商品大方塊，新增外帶會立即建立可見佇列訂單，依序顯示 `No. 001`、`No. 002`，即使尚未加入品項也會保留在桌況頁；咖啡/茶飲品項會開啟選項面板並要求先選「飲品溫度」，未選時會顯示必填警告；票券上可直接修改顧客、方式、付款與常用備註；`order.scriptcoffee.com.tw` 會預設進入消費者線上點餐頁。
- 櫃台效率操作：已有最近/常用品項快速加購並跨重啟保留、常用備註 chip、未送出櫃台訂單自動恢復、點桌況頁櫃台訂單回購物車續編；購物車左欄改為高密度票券清單，服務方式保留直接切換，付款與「需要袋子」等常用備註同列顯示，備註 chip 可再次點按取消且已選時會用主色與勾選圖示回饋，多個品項註記改為可換行 chip，避免後段文字被單行截斷；品項壓縮為商品/註記、數量、金額三欄，平板常見 6 個品項可直接看到不需滑動；底部「結帳」「出單」「結帳不出單」三分流改為一致尺寸與高對比圖文，避免文字與圖示互疊或過淡。顧客資訊編輯會維持固定 POS 舞台高度，前端會在載入時記住鍵盤出現前的最大 layout viewport，高度變小的鍵盤 resize 事件不會更新工作台高度，避免左側票券被上推壓縮。商品分類列支援左右滑動快速切換分類，供應狀態為停售、售完或暫停供應的商品會保留在 POS 菜單中反灰、不可點按並顯示狀態標籤；連點工具箱 6 下進入後台編輯模式後，可長按拖曳分類 tab 或商品卡片交換順序，例如把咖啡與茶飲對調、把冰美式與熱拿鐵對調，拖曳與位移手勢會短暫抑制點擊，避免平板上長按排序被誤判為點餐。櫃台自己建立的外帶/外送單不再顯示鎖定逾時；桌況頁訂單列改為單號/顧客資訊、直排狀態、右側金額三欄，讓「新單」等狀態與金額更接近現代出單票券。訂單搜尋與篩選狀態跨重啟保留、日期/取餐方式/來源/排序進階查詢與同列重設篩選、履約時間預警資料、訂單明細展開、訂單左滑揭露已完成/已取餐與刪除；桌況頁刪除不需額外驗證，外送/線上訂單按「已取餐」會直接歸納為已完成並從目前佇列消失。另有列印單左滑刪除、庫存/低庫存提示、下單原子扣庫存、多平板訂單鎖定、收款確認、未收款訂單作廢、已收款退款沖銷、列印重印紀錄、正式開班/關班、單屏式關帳摘要、交班預檢、班別對帳、關帳異常檢查與強制確認、鍵盤捷徑；完成結帳或出單後會清空購物車、重置顧客電話/備註並回到佇列，避免帶到下一張單。
- 影片 UI/UX 導入：2026-05-02 參考 iCHEF 操作影片後，保留現有預設色系，新增 POS 工具箱、外觀設定卡片、工具箱重新同步與常用工作區跳轉；外觀設定不再固定顯示在工具箱底部，點卡片後進入設定頁，可切換深色模式，並用 -200% 到 +200% 滑桿調整整體介面縮放、畫面密度、文字大小與浮動工具箱透明度。外觀設定會寫入 `pos_appearance` runtime setting，POS 載入 `/settings/runtime` 後自動套用，讓換平板或 fresh reinstall 後仍能沿用同一組外觀。POS 工作台現在由固定平板 large viewport 的縮放舞台承載，縮放會包含文字、浮動工具箱與供應狀態頁，並以不產生水平溢出為基準；浮動工具箱已提升為全域固定層，會在 POS、線上入口、後台與供應狀態等主要頁面維持可用，後台編輯模式下長按工具箱 2 秒可直接退出；Android APK 以 `adjustNothing` 搭配 `interactive-widget=overlays-content` 避免鍵盤 resize WebView。供應狀態入口已常駐在列印/前台操作頁，不再只限 Native APK 顯示，且支援搜尋、分類、狀態篩選、批次暫停/恢復篩選結果、儲存確認與回復上一個動作；2026-05-04 供應狀態工具箱擴成商品/分類/註記管理，可新增/刪除分類與商品、建立註記大項與選項、把任意註記綁定到任意商品，並可在註記群組建立後切換必選或非必選，儲存時會同步分類順序、註記群組、商品綁定與註記停售狀態到 `online_ordering` runtime，且只有成功寫入資料庫才清除未儲存狀態，供新平板與 `order.scriptcoffee.com.tw` 短輪詢更新。後台已新增營運紀錄時間線，整合平板心跳、開關班與關鍵稽核事件，可搜尋、依類型/平板篩選並匯出 CSV；線上點餐設定已接 `online_ordering` runtime setting，可控制接單、預約、平均備餐、未確認提醒、接單確認、提示音播放模式與音量。2026-05-03 依 iPad 截圖重塑主流程，主佇列第一層先收斂為搜尋/條件/訂單列，佇列顯示短單號且完整單號保留在 title，鎖定標籤不顯示 `tablet-*` 類平板識別，深色模式需維持標題與顧客文字可讀；2026-05-04 依新增外帶影片調整為進入點餐時立即建立可見草稿單號，送出後沿用同一單號；本輪再擴成先建單後編輯，空單與未結帳單會先寫入 Supabase `orders.draft_lines`，正式結帳/出單後透過 `finalize_pos_order()` 轉正式明細並扣庫存，只有 API 失敗時才降級到本機草稿或 `script-coffee-pos-pending-orders` 補同步；任務快篩、履約提醒與 SOP 資料後續適合放進工具箱延伸；班別關帳已改為摘要橫列、交班預檢與右側班別對帳的單屏優先布局，未交付、待收款、付款異常、列印失敗與作廢記錄仍可直接帶入桌況頁篩選處理。
- 前端資料流：`src/lib/posApi.ts` 是唯一 POS API client，負責把 Supabase Edge Function snake_case 回應轉成 Vue view model；`usePosSession()` 只處理畫面狀態與 fallback。
- 門市 SOP 助手：`src/data/posKnowledge.ts` 保存本機 SOP 條目與分類，`src/App.vue` 只處理搜尋、篩選、選取與跳轉；未來真實 SOP 匯入應優先擴充資料檔。
- 後台入口：`src/components/AdminPanel.vue` 管理商品菜單、線上點餐 runtime 設定、庫存數量、低庫存門檻、暫停供應至、POS/線上/掃碼可見性、備餐站、會員錢包與 CSV 匯出、營運日報與 CSV 匯出、金流回呼事件篩選/匯出、出單機規則、角色權限、營運紀錄時間線、平板在線與操作稽核匯出；前端需先連點工具箱 6 下進入後台編輯模式，後端管理端點不再要求舊驗證 header。
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
- POS API 同步：商品、訂單、runtime 出單機/線上點餐/外觀設定與收銀班別會從 `/products?channel=pos`、`/orders`、`/settings/runtime`、`/register/current` 載入；外觀設定寫進 `pos_appearance` runtime setting，包含 `interfaceScale`、`densityScale`、`textSize`、`darkMode` 與 `toolboxOpacity`。商品分類已由固定 enum 放寬為 `products.category text`，工具箱的分類順序、註記大項/選項、商品註記綁定與註記供應狀態會寫進 `online_ordering.menuCategories`、`menuOptionGroups`、`productOptionAssignments` 與 `noteSupplyStatuses`，商品新增/刪除/供應狀態變更與商品拖曳排序走 `/admin/products`、`/admin/products/:id` 寫資料庫與稽核，不再把新增商品或排序調整視為本機完成；分類拖曳寫回 runtime、商品拖曳寫回 `products.sort_order` 後，POS 會重新拉取後端資料校準畫面。消費者線上菜單讀 `/settings/runtime` 與 `/products?channel=online`，每 15 秒更新一次，分類順序跟隨 `online_ordering.menuCategories`，商品順序跟隨 `/products` 依 `sort_order` 回傳的順序，並依 runtime 註記設定顯示必填/選填選項與加價；`online_ordering.enabled=false` 時保留瀏覽但阻擋線上/QR 建單；櫃台草稿單走 `POST /orders/drafts` 與 `PATCH /orders/:id/draft`，草稿品項保存在 `orders.draft_lines`，正式結帳/出單走 `POST /orders/:id/finalize` 由 `finalize_pos_order()` 在同一 transaction 寫正式品項並扣庫存；線上建單與沒有草稿的櫃台建單仍可走 `POST /orders` 與 `create_pos_order()`。`GET /orders` 會把超過 `POS_PAYMENT_EXPIRY_MINUTES`（預設 20 分鐘）的線上/QR 待付款新單自動改成 `status=failed`、`payment_status=expired`；若 `online_ordering.acceptanceRequired=true`，線上/QR 新單會先顯示待接單通知，不進桌況頁佇列，按「接單」後才走 `POST /orders/:id/claim` 並排入佇列。收款確認走 `PATCH /orders/:id/payment`，未收款作廢走 `POST /orders/:id/void`，已收款退款走 `POST /orders/:id/refund`，訂單狀態走 `PATCH /orders/:id/status`，列印工作會依後台規則拆成多筆 `POST /print-jobs`，列印單刪除走 `DELETE /print-jobs/:id`。POS 啟動後每 20 秒短輪詢 `/orders`、`/settings/runtime` 與 `/register/current`，每 30 秒送 `/station/heartbeat`，平板回到前景時也會補同步與檢查線上新單提醒；API 失敗建立的櫃台單才會保存到 `script-coffee-pos-pending-orders`，佇列會標示「本機待同步」，後續同步成功時先補寫遠端並去重。
- 商品庫存欄位：`products.inventory_count`、`low_stock_threshold`、`sold_out_until` 由 `20260429110000_add_product_inventory_controls.sql` 新增；前端仍保留 `is_available` 作為人工上架/停售開關，庫存為 0 或暫停到期前會在 POS 端視為不可點。
- 下單扣庫存：`20260429150000_add_create_pos_order_function.sql` 新增 `create_pos_order()`，`POST /orders` 會透過 DB function 原子建單與扣庫存；`20260504090000_add_counter_order_drafts.sql` 新增 `orders.draft_lines` 與 `finalize_pos_order()`，讓櫃台先建草稿、跨平板追溯購物車，正式結帳/出單時再原子寫品項與扣庫存；庫存不足時整筆 rollback，POS 會移除暫存單並把品項還回購物車。
- 外送/履約欄位：`20260429161000_add_order_fulfillment_fields.sql` 新增 `orders.delivery_address` 與 `requested_fulfillment_at`，線上與櫃台建單都會寫入，POS 佇列與收據 payload 會顯示希望時間與地址。
- 多平板鎖定欄位：`orders.claimed_by`、`claimed_at`、`claim_expires_at` 由 `20260429123000_add_order_claim_lease.sql` 新增；`pos-api` 只允許未鎖定、本機持有或已逾時的進行中訂單取得 claim，已交付/失敗/作廢單不可再 claim，狀態更新、收款與 print job 建立前都會檢查 lease，已交付/異常單會釋放 lease。
- 收銀班別欄位：`register_sessions` 由 `20260429133000_add_register_sessions.sql` 新增；`pos-api` 提供 `/register/current`、`/register/open`、`/register/close`，前端需先進入後台編輯模式才會開班/關班。
- 關帳異常欄位：`register_sessions.open_order_count`、`failed_payment_count`、`failed_print_count`、`voided_order_count` 由 `20260429140500_add_register_closeout_exception_counts.sql` 新增；開班中的 `/register/current` 會動態重算，關班時會保存快照。有未交付、付款異常或列印失敗時，`/register/close` 需送 `force=true` 才能關班。
- 操作稽核：`pos_audit_events` 由 `20260429142000_add_pos_audit_events.sql` 新增；`pos-api` 會記錄建單、claim、釋放、狀態更新、收款、付款逾期、退款、作廢、商品/設定異動、會員建立、錢包調整、開班與關班事件。商品異動會寫入庫存、低庫存門檻、售價、上下架與暫停供應的前後值/差額，後台 `/admin/audit-events` 可用來追帳與排錯。
- 會員錢包：`20260429154000_add_member_wallet_functions.sql` 新增 `create_pos_member()` 與 `adjust_pos_member_wallet()`；後台 `GET/POST /admin/members` 可建立/查詢會員，`POST /admin/members/:id/wallet-adjustments` 會在單一 DB transaction 內更新 `members.wallet_balance` 並寫入 `transaction_ledger`。
- 金流 webhook：`20260429172000_add_payment_webhook_events.sql` 新增 `payment_events` 與 `record_pos_payment_event()`；`POST /payments/webhook/:provider` 需 `POS_PAYMENT_WEBHOOK_SECRET`，以 provider + event id 做冪等，金額不符只記錄不改單，已付款訂單不會被失敗/逾期回呼降級，退款回呼會寫負數交易流水。後台 `GET /admin/payment-events` 可讀最近回呼、重送與未套用事件，並支援 provider/狀態篩選與 CSV 匯出，方便正式串 LINE Pay / 街口前排錯。
- RPC 權限：`20260429183000_lock_down_pos_security_definer_rpc.sql` 撤掉 `create_pos_order()`、`refund_pos_order()`、`create_pos_member()`、`adjust_pos_member_wallet()` 與 `record_pos_payment_event()` 對 `public/anon/authenticated` 的 `EXECUTE`，只保留 `service_role`，讓外部請求固定經過 `pos-api` 的 webhook secret 與輸入驗證。
- 金流事件 RLS：`20260429183500_lock_down_payment_events_rls.sql` 補上 `payment_events` 的 no-direct-client policy，避免 anon/authenticated 直接讀寫 webhook 原始事件；後台查詢仍固定走 `pos-api` service role。
- 營運日報：`GET /admin/reports/daily?date=YYYY-MM-DD` 依台灣日界線彙總當日訂單，回傳實收、待收、退款、異常、付款方式、訂單來源、服務方式、時段分布與熱門商品；後台報表頁直接讀此端點。
- 退款沖銷：`20260429143000_add_refunded_payment_status.sql` 新增 `payment_status=refunded`；`20260429143500_add_refund_pos_order_function.sql` 新增 `refund_pos_order()`，讓退款在同一個資料庫 transaction 內更新訂單並寫入 `transaction_ledger`。
- 平板心跳：`pos_station_heartbeats` 由 `20260429144500_add_pos_station_heartbeats.sql` 新增；POS 工作台每 30 秒 upsert 一次，後台 `/admin/stations` 可看最後在線時間。
- 平板測試：`rtk npm run tablet:url` 會輸出同 Wi-Fi 平板可開啟的本機網址；瀏覽器版不能直連 TCP 出單機。
- APK 測試：已加入 Capacitor Android 專案、`Android APK` workflow 與 Android `LanPrinter` TCP socket plugin；本機 `rtk npm run apk:debug` 會先同步 Capacitor，macOS arm64 預設改用暫存 x86_64 Temurin 21 建置，並把 JVM fatal error 檔導到 `~/.cache/script-coffee-pos/`，避免 `hs_err_pid*.log` 污染專案資料夾。
- 列印計畫：`src/lib/printing.ts` 會依 `printer_settings` 的服務方式、品項分類、貼紙/收據模式與 copies 建立多筆 EZPL payload；前台列印站已整理為 iCHEF 式出單機清單、印單規則與列印佇列，不再承擔庫存/供應管理。列印站 healthcheck 會分離畫面預覽與實際 EZPL payload，`usePosSession()` 逐筆建立/回寫 print job，列印頁會列出 print jobs 並可滑動刪除，Android APK 逐筆送 TCP。
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
