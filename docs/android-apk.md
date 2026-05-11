# Android APK 測試流程

## 產出 APK

### GitHub Actions

這適合需要可追溯 artifact 的測試，產物會固定保存在 Actions artifact。

1. 到 GitHub repo 的 Actions。
2. 選擇 `Android APK` workflow。
3. 按 `Run workflow`。
4. 等 `Build debug APK` 完成。
5. 在 workflow run 的 Artifacts 下載 `script-coffee-pos-debug-apk`。
6. 解壓縮後會得到 `app-debug.apk`。

### 本機建置

本機需要先安裝 Node.js 22 以上、JDK 21、Android Studio / Android SDK，並設定好 Android SDK path。完成後執行：

```bash
rtk npm run apk:debug
```

`apk:debug` 會先跑 `cap:sync`，再執行 Android `assembleDebug`。在 macOS arm64 上，腳本預設使用暫存的 x86_64 Temurin 21 JDK（`~/.cache/script-coffee-pos/`）透過 Rosetta 完成 Gradle build，並把 JVM fatal error file 寫到同一個 cache 目錄，避免 `hs_err_pid*.log` 出現在專案資料夾。若要強制使用本機 native JDK，可暫時設定 `POS_APK_USE_NATIVE_JDK=1`。

APK 位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

若平板已用 USB 連到 Mac 並開啟 USB 偵錯，可直接安裝：

```bash
rtk npm run apk:install
```

本專案後續 APK 測試預設採用 fresh reinstall，因為 GitHub Actions artifact 與本機 debug build 的簽章可能不同。fresh reinstall 會先移除平板上的 `com.scriptcoffeeshop.pos`，因此會清除該 App 的本機資料；這是此 POS prototype 的預設測試流程。

如果安裝時出現 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`，代表平板上舊 debug APK 的簽章與這次建置不同。debug APK 只用於測試，直接先移除舊版再安裝：

```bash
rtk npm run apk:install:fresh
```

## 平板安裝

1. 將 `app-debug.apk` 傳到 Samsung 平板。
   - 可用 USB 傳檔、雲端硬碟、Telegram、LINE 檔案傳送，或 ADB 安裝。
2. 在平板允許安裝未知來源 App。
   - Samsung 常見路徑：`設定` → `安全性與隱私權` → `更多安全性設定` → `安裝未知的應用程式`。
   - 選擇你用來開啟 APK 的 App，例如 `Chrome`、`我的檔案` 或雲端硬碟 App，開啟允許。
3. 點開 `app-debug.apk`，選擇安裝。
4. 安裝完成後開啟 `Script Coffee POS`。

## 白屏偵錯

若 APK 開啟後一片空白，先用 USB 偵錯連線並擷取 log：

```bash
rtk adb logcat -d -v time | grep -Ei 'Unable to open asset|AndroidRuntime|FATAL|Uncaught|TypeError|ReferenceError|SyntaxError|ERR_|net::|Capacitor' | tail -n 160
```

曾遇過的白屏原因是舊 APK 內的 Web assets 使用 `/pos/assets/...` 絕對路徑，Capacitor 會在 `https://localhost/pos/assets/...` 找檔案而失敗。新版 build 應使用 `./assets/...` 相對路徑；若看到 `Unable to open asset URL`，請重新下載最新版 artifact，並用 fresh install 重新安裝。

## 外帶/外送快速出店

外帶/外送快速出店對照 iCHEF 工具箱的訂單快速出店流程：POS 會依來源與完成時間篩選已付款且到點的外帶/外送訂單，執行時逐筆呼叫 `PATCH /orders/:id/status` 更新為 `served`。這不是 APK 本機資料，fresh reinstall 後仍以 Supabase 訂單狀態為準。

1. 在 APK 建立或載入數張外帶/外送單，包含已付款、待收款、不同來源與不同取餐/送達時間。
2. 連點工具箱 6 下進入後台編輯模式，回到外帶/外送頁設定快速出店來源與完成時間。
3. 確認「出店 N 張」只計入已付款、外帶/外送、未出店、未作廢且完成時間符合的訂單；被另一台平板 claim 的單會顯示為略過。
4. 執行後確認訂單離開待處理佇列，另一台平板同步看到同樣結果。
5. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認已快速出店的訂單不會靠本機快取回到待處理佇列。

## 候位提前點餐

候位提前點餐對照 iCHEF「現場候位登記與提前點餐」流程。候位列的「提前點餐」會建立內用草稿單，並把草稿 `orderId` 寫回 `floor_plan.waitline`；品項存在 `orders.draft_lines`，入座時會把同一張訂單轉成指定樓層/桌位的內用單。這不是 APK 本機資料，fresh reinstall 後仍應從 Supabase runtime 與草稿單還原。

1. 在 APK 桌位地圖新增一筆候位，填姓名、電話、人數與備註。
2. 按候位列「提前點餐」，確認切到點餐頁且票券顧客資料帶入候位資訊。
3. 加入至少一個品項後回桌位地圖，確認候位列顯示提前點餐單號、品項數與金額；另一台平板應同步看到同一候位預點餐狀態。
4. 按「開啟點餐」續編同一張單，不應建立第二張候位草稿。
5. 選擇空桌讓候位入座，確認訂單改成該桌內用單、點餐頁載入原品項，接著可出單或結帳。
6. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認候位預點餐關聯、草稿品項與已入座的桌位訂單仍從 Supabase 還原。

## 庫存管理

庫存管理對照 iCHEF POS「庫存狀態」的進貨、退貨、消耗、報廢與盤點流程。庫存類別、品項與操作紀錄都寫入 Supabase，不是 APK 本機資料。

1. 連點工具箱 6 下進入後台編輯模式，開啟工具箱「庫存管理」。
2. 新增一個庫存類別與一個庫存品項，設定單位、預設單價、目前存量與安全庫存。
3. 對同一品項依序建立進貨、消耗、報廢與盤點紀錄，確認畫面存量依操作後數量更新。
4. 另一台平板或 Web POS 開啟同一面板，確認可讀到相同類別、品項、最近紀錄與操作後存量。
5. 在後台「商品菜單」替商品或註記新增自動消耗規則，建立正式訂單後確認 `inventory_records` 出現 `consumption` 紀錄且庫存品項扣量。
6. 將同一訂單明細切換「暫停出單」再正式建單，確認暫停出單的品項不扣自動消耗庫存。
7. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認庫存資料與自動消耗規則仍從 Supabase 還原，且不依賴 fresh reinstall 前的本機記憶體。

## 套餐商品

套餐商品對照 iCHEF 商品管理的「套餐子項目與可選商品」流程。規則存在 `online_ordering.comboProductAssignments`，正式訂單的套餐子商品存在 `order_items.combo_items`，不是 APK 本機資料。

1. 連點工具箱 6 下進入後台編輯模式，開啟供應狀態，選一個要當套餐主商品的商品。
2. 在「套餐子項目」新增一組必選項，設定最少/最多選擇數量、是否允許重複選擇，加入兩個以上單點商品並設定其中一個加價。
3. 若可選子商品本身綁有註記群組，確認套餐面板會在該子商品底下顯示註記按鈕，必選子商品註記未選時不能加入訂單。
4. 回 POS 點該套餐主商品，確認必選子項目未選時無法加入訂單；選擇後票券會顯示子項目、子商品註記與加價後單價。
5. 若子商品有可售庫存、自動耗料規則或子商品註記耗料規則，出單或結帳後確認子商品庫存與 `inventory_records.consumption` 已更新。
6. 到列印站設定只列印某個套餐子商品，建立含該子商品的套餐後確認 APK print job / preview 依子商品命中規則。
7. 用另一台平板或 Web POS 展開同一張正式訂單，確認套餐子商品與子商品註記仍從 `order_items.combo_items` 還原。
8. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認套餐設定與既有訂單子商品仍從 Supabase 還原，不依賴 fresh reinstall 前的本機記憶體。

## 商品文字註記與加減價

商品文字註記與臨時加減價對照 iCHEF「商品加減價與註記」流程。這些資料保存於訂單明細 `options` 與 `unit_price`，不是 APK 本機資料。

1. 在 POS 加入一個一般商品，點票券上的品項名稱開啟選項面板。
2. 輸入「文字註記」，再輸入 `+ 加價` 或 `- 減價`，確認單價與票券註記即時更新。
3. 若後台「權限」把「變價註記」設為需要驗證，加入或更新含加減價的品項前應跳出員工識別碼驗證。
4. 減價輸入超過品項金額時，APK 應阻擋更新並顯示錯誤。
5. 出單或結帳後，換另一台平板或 Web POS 展開訂單，確認文字註記與調整後單價仍由 Supabase 訂單明細還原。
6. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認既有訂單的文字註記與加減價不依賴 fresh reinstall 前的本機記憶體。

## 付款拆單

付款拆單對照 iCHEF「拆單各付各或均分」流程。子單資料寫入 Supabase `orders.payment_splits`，不是 APK 本機資料；fresh reinstall 後應仍從訂單欄位還原。

1. 在 APK 先建立一張櫃台草稿單，加入至少兩個品項。
2. 按點餐頁「付款/拆單」進入付款頁，按「均分 2 張」，確認兩張子單金額合計等於訂單合計。
3. 按「新增子單」與「重置」，確認可增加子單與回到未拆單狀態。
4. 再建立兩張子單，於「商品各付各」把品項指派到不同子單；未指派品項應暫列第一張子單。
5. 每張子單選不同付款方式，並將其中一張按「標記已結」，確認訂單中心顯示「拆單 N 張」摘要。
6. 另一台平板或 Web POS 進入外帶/外送訂單中心，確認同一張單顯示相同子單數、未結張數與已結金額。
7. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認拆單摘要、商品指派、付款方式與已結/未結狀態仍從 Supabase 還原。

## 關帳員工識別碼

關帳對照 iCHEF「開始關帳」第一步，必須記錄操作員。員工識別碼來自後台「權限」的 `access_control.staffAccounts`，並會檢查角色是否有 `closeRegister` 權限，不是 APK 本機資料。

1. 連點工具箱 6 下進入後台編輯模式，確認後台「權限」至少有一個啟用員工；預設店主識別碼為 `0000`。
2. 在關帳頁開班後準備關班，先不要填員工識別碼，確認按關班會提示「請輸入員工識別碼」且不會送出關班。
3. 輸入不存在或已停用的員工識別碼，確認 API 回覆關班失敗，班別仍維持 open。
4. 輸入啟用員工識別碼後關班；若有未交付、付款異常或列印失敗，需另勾選強制關班。
5. 回後台「操作稽核」確認 `register.close` metadata 具有操作員姓名、員工識別碼、角色、實點現金、預期現金與異常數。
6. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認關班結果與操作稽核仍從 Supabase 還原，不依賴本機資料。

## 關帳信 / 日結報表寄送

關帳信對照 iCHEF「小結／關帳報表與寄送關帳信」。角色需有 `sendDailyReports` 權限，員工才會在後台「權限」顯示「報表寄送 Email」欄位；收件設定與寄送紀錄都存在 Supabase，不是 APK 本機資料。

1. 連點工具箱 6 下進入後台編輯模式，進入「權限」。
2. 確認測試員工所屬角色勾選「日結報表寄送」，該員工列才會出現「報表寄送 Email」欄位。
3. 輸入測試 Email 並儲存權限；另一台平板或 Web POS 重新載入後應看到同一收件設定。
4. 完成一次關帳後，進入後台「營運日報」，確認「關帳信紀錄」出現該員工與收件 Email。
5. 若 Edge Function 已設定 `RESEND_API_KEY` 與 `POS_REPORT_EMAIL_FROM`，狀態應變為「已寄送」；未設定時狀態會保留「待寄送」且顯示 manual provider。
6. 回後台「操作稽核」確認有 `register.close_report.delivery` 事件，metadata 包含 total、sent、queued、failed。
7. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認員工 Email、關帳信 outbox 與稽核仍可查。

## POS 操作權限驗證

POS 操作權限對照 iCHEF 後台「帳號與權限」的操作驗證開關。`access_control.protectedPermissions` 會保存在 Supabase runtime；APK 只從 `/settings/runtime` 取得低敏感的 `accessPolicy`，真正驗證會呼叫 `POST /access/verify` 並由後端比對員工識別碼與角色權限。

1. 連點工具箱 6 下進入後台編輯模式，到後台「權限」新增一位測試員工，建立一個不含 `deleteOrderItems` 或 `sendOrdersToKitchen` 的角色。
2. 在「操作驗證開關」勾選「出單至廚房」「結帳」「服務費/其他費用」「手動折扣」「刪品項」「刪單」「取消線上訂單」「錢櫃」等測試項目並儲存。
3. 回 POS 建立草稿單，按「出單」或刪除購物車品項，確認出現員工識別碼視窗。
4. 輸入無此權限的員工識別碼，確認操作被拒絕且訂單/品項狀態不改變；輸入具備權限的識別碼後操作才繼續。
5. 測外帶/外送訂單左滑刪除、線上新單接單/拒絕、作廢/退款與工具箱錢櫃管理，確認被保護操作都使用同一個驗證 modal。
6. 到後台「操作稽核」確認可看到 `access.verify`，metadata 應包含 permission、操作員姓名與角色。
7. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認操作驗證開關仍從 `access_control` runtime 還原，且不依賴 fresh reinstall 前的本機記憶體。

## 混合支付與交易明細

混合支付對照 iCHEF「同張訂單使用多種支付模組」流程；交易明細張數對照「列印多張交易明細」。付款分配寫入 `orders.payment_breakdown`，自動列印張數寫入 `orders.transaction_receipt_count`，都不是 APK 本機資料。

1. 在 APK 建立一張櫃台草稿單並加入品項，進入「付款/拆單」。
2. 按「開啟混合支付」，新增付款方式並輸入多筆金額；確認金額合計不等於訂單合計時不能結帳。
3. 將 LINE Pay、街口或刷卡等線上支付模組同時設成兩種，確認系統提示同張單只能保留一種線上支付。
4. 修正金額後逐筆標記已結，設定「交易明細」張數，按結帳。
5. 確認出單佇列產生交易明細 print job，payload 會列出混合支付明細；訂單中心也可按「交易明細」事後補印。
6. 關帳頁付款方式對帳應依混合支付金額分攤，不得只把整張單算到主付款方式。
7. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認同一張訂單仍顯示混合支付摘要、交易明細張數與可補印交易明細。

## 優惠活動 / 折扣模組

優惠活動對照 iCHEF「結帳設定 > 優惠活動」的店家優惠、自動/手動優惠、排序、POS 與雲端餐廳通路設定。規則存在 Supabase `discount_settings` runtime，APK fresh reinstall 後應重新從 `/settings/runtime` 載入，不靠本機資料。

1. 連點工具箱 6 下進入後台編輯模式，到後台「優惠活動」。
2. 新增一個自動優惠與一個手動優惠，分別設定全單、分類或指定商品、折扣/折讓、最低消費、服務方式、POS/線上通路與優惠時間。
3. 回 POS 加入符合條件的品項，進入「付款/拆單」，確認自動優惠會出現在優惠活動區並折抵合計；手動優惠需由員工勾選後才套用。
4. 將其中一個活動設定為「需要驗證」，再停用自動優惠或勾選手動優惠，結帳時應跳出 `applyManualDiscounts` 員工識別碼驗證。
5. 用消費者頁送一張符合線上自動優惠的訂單，確認結帳顯示優惠活動，外送最低金額與滿額免運以扣除優惠後金額判斷。
6. 送單後在 APK 訂單中心展開訂單，確認 `discount_amount` 與合計一致；若用舊頁或 API 繞過前端，`pos-api` 仍應依 runtime 重新計算自動優惠。
7. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認優惠活動設定、POS 付款頁可用活動與線上訂單折扣都從 Supabase runtime 還原。

## 會員優惠券兌換

會員優惠券使用狀態對照 iCHEF「同會員同券只能使用 1 次」與「作廢使用優惠券訂單時退回優惠券」。狀態存在 Supabase `member_coupons`，APK fresh reinstall 後不得靠本機快取還原舊券。

1. 在後台建立會員與 active 優惠券，或確認既有會員有 active 優惠券。
2. 在 APK 與另一個瀏覽器工作站同時搜尋同一會員，兩邊付款頁應能看到同一張券。
3. 在 APK 使用該券建立訂單；後台優惠券列表應顯示已使用、兌換時間、訂單與站台。
4. 另一個工作站不重新整理直接用同一張券出單時，API 應回 409，POS 不得留下本機待同步單。
5. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，重新搜尋同會員時不得再看到已使用券。
6. 對原訂單作廢或退款後，重新搜尋同會員，該券應回到 active 並可再次選用。

## 線上/掃碼新單背景提醒

APK 內含 `OnlineOrderNotifier` native plugin 與 `OnlineOrderPollingService` foreground service，會在 POS 進入背景、螢幕熄滅或 WebView 暫停時接手線上/掃碼新單提醒。前景仍由 Vue + Supabase Realtime invalidation 驅動接單浮層與提示音；背景時 native 層會啟動 `dataSync` 前景服務，依目前 `online_ordering` 設定短輪詢：

- `/settings/runtime`：同步 `acceptanceRequired`、`unconfirmedReminderMinutes`、`notificationRepeatMode`、`soundEnabled`、`notificationVolume`。
- `/orders?limit=30`：找出 `online` / `qr`、`status=new`、付款狀態為 `pending` / `authorized` / `paid` 的候選訂單。
- `/online-order-reminders/state?orderIds=...`：讀取 Supabase 共享的 `snoozed` / `seen` 狀態，讓背景 notification 與前景橫幅使用同一份跨平板提醒去重來源。

Android 13 以上需允許通知權限；首次開啟 POS 後系統會跳出通知權限請求。若權限被拒絕，前景提醒不受影響，但背景 notification 不會顯示。提示音音量跟隨線上點餐設定的 `notificationVolume`，連續播放或只提醒一次跟隨 `notificationRepeatMode`；按 POS 內的「稍後」會把同一批 active orders snooze 並寫回 `/online-order-reminders/state`，按「已讀」「接單」「拒絕接單」或訂單從佇列消失都會寫入 seen/handled 狀態，避免另一台平板、fresh reinstall 或熄屏回前景後重複提醒。

背景 service 會顯示低優先度的 `POS 線上接單提醒執行中` 常駐通知；真正的新單提醒仍使用 `線上/掃碼新單提醒` 高優先度 channel。測 log 時應看到 `foreground service poll activeOrders=... fetched=...`，並在新單符合條件時看到 `posting foreground service notification signature=...`。

實機測試建議：

```bash
rtk npm run apk:debug
rtk npm run apk:install:fresh
rtk adb logcat -c
rtk adb logcat -v time | grep -Ei 'OnlineOrderNotifier|Notification|Capacitor|AndroidRuntime'
```

測試流程：

1. 在 APK 前景確認線上/掃碼訂單可觸發原本的待接單浮層與提示音。
2. 按 Home 或熄滅螢幕，從 Web 線上點餐送出一張新單。
3. 確認平板顯示 `線上/掃碼新單待接單` Android notification，提示音節奏符合後台設定。
4. 回到 APK，確認桌況頁補同步並只顯示上方待接單橫幅；按「查看訂單內容」確認顧客、付款與品項明細，按「稍後」後同一張單在其他平板與重開 App 後都不重複提醒，直到 snooze 到期。
5. 重新送一張線上/掃碼新單，分別測「已讀」「接單」與「拒絕接單」；每次操作後確認該單從所有平板的待接單提醒移除，且回前景或熄屏後不再重複提醒同一單。
6. 將後台 `online_ordering.soundEnabled`、`notificationRepeatMode` 或 `notificationVolume` 改掉，再背景送單，確認背景提醒套用新的 runtime 設定。

Web 版沒有原生背景輪詢能力，會在 Browser Notification API 已授權時提供背景通知 fallback；未授權或瀏覽器不支援時，仍以回前景後的 Realtime/polling 補同步與前景提示音為準。

這一版的 APK 背景提醒已改用 foreground service 覆蓋按 Home、切到背景、螢幕熄滅與回前景補同步；若使用者從最近任務手動滑掉 App、強制停止 App 或系統終止整個程序，後續正式版仍建議再接 FCM push 才能提供被終止後仍必達的提醒。

## 線上結帳統編與載具

線上點餐結帳說明、統一編號欄位與載具條碼欄位由 `online_ordering` runtime 控制；實際送出的資料寫入 Supabase `orders.tax_id` 與 `orders.invoice_carrier_barcode`，不是 APK 本機資料。這對照 iCHEF 外帶/外送訂餐流程的結帳欄位顯示設定。

1. 連點工具箱 6 下進入後台編輯模式，到後台「線上點餐」開啟「結帳顯示統一編號」與「結帳顯示載具條碼」，並填入結帳說明後儲存。
2. 用 `order.scriptcoffee.com.tw` 或本機消費者頁送出一張線上單，填入 8 碼統一編號與載具條碼。
3. 回 APK 前景，確認線上新單提醒的「查看訂單內容」顯示統一編號與載具條碼。
4. 接單後在訂單中心展開同一張單，確認訂單明細顯示相同資料；列印顧客聯或收據時 payload 也應帶出 `TAX ID` 與 `CARRIER`。
5. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認同一筆訂單仍能從 Supabase 載回統編與載具，欄位開關與結帳說明也仍從 runtime 還原。
6. 輸入非 8 碼統編或超過 32 字元的載具時，消費者頁應先阻擋；若繞過前端，`pos-api` 與資料庫 constraint 也應拒絕。

## 內用掃碼結帳流程

內用掃碼結帳模式存在 `online_ordering.dineInCheckout`，對照 iCHEF 後台「內用掃碼點餐 > 結帳流程」的「先結 / 後結」。這不是 APK 本機設定；fresh reinstall 後仍應從 runtime 還原。

1. 連點工具箱 6 下進入後台編輯模式，到後台「線上點餐」將「內用掃碼結帳模式」切成「後結」，填入最多 500 字的結帳說明後儲存。
2. 在 APK 建立內用桌位單並列印或預覽「訂單 QR Code」，用 QR 頁開啟點餐，確認結帳區顯示後結說明且不顯示付款方式按鈕。
3. 後結模式送出 QR 內用單後，POS 訂單應以現場待收款進入；繞過前端送單時，`pos-api` 也應把付款方式覆寫成 `cash`、付款狀態覆寫成 `pending`。
4. 回後台「線上點餐」切成「先結」後重新整理 QR 頁，確認只顯示 LINE Pay、街口與線上刷卡等線上付款方式，不顯示取餐時付款或轉帳。
5. 先結模式下嘗試用舊頁或 API 送出 `cash` / `bank_transfer`，`POST /orders` 應回覆 409，不得寫入訂單。
6. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認結帳模式、結帳說明與 QR 頁付款行為仍從 `online_ordering` runtime 還原。

## 線上服務方式開關

自取、內用掃碼與外送的送單狀態存在 `online_ordering.serviceModeAvailability`，對照 iCHEF 可在 POS 或後台臨時調整營業狀態的流程。這不是 APK 本機開關，fresh reinstall 後仍應從 runtime 還原。

1. 連點工具箱 6 下進入後台編輯模式，到後台「線上點餐」分別關閉「開放自取」「開放內用掃碼」或「開放外送」其中一項並儲存。
2. 用消費者頁重新整理，確認被關閉的服務方式按鈕 disabled，畫面顯示該方式目前不開放。
3. 保持總開關開啟，只關閉外送時，自取仍可送單，外送不得送單。
4. 嘗試用 API 或已開啟的舊頁面繞過前端送出 disabled service mode，`POST /orders` 應回覆 409。
5. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認後台服務方式開關仍從 `online_ordering` runtime 還原。

## 內用掃碼用餐與點餐限時

用餐限時與最後加點規則存在 `online_ordering.dineInTimeLimit`，對照 iCHEF 內用掃碼點餐的「用餐與點餐限時」。這不是 APK 本機設定；fresh reinstall 後仍應從 runtime 與訂單開單時間還原。

1. 連點工具箱 6 下進入後台編輯模式，到後台「線上點餐」設定用餐限時、最後加點與假日規則後儲存。
2. 回 POS 工具箱，按「用餐與點餐限時」卡片切換功能狀態，確認另一台平板或後台重新載入後狀態同步。
3. 在 APK 建立內用桌位單並列印或預覽「訂單 QR Code」，QR URL 應包含 `source=qr`、訂單、桌號與 `openedAt`。
4. 用 QR 頁開啟點餐，確認顯示最後加點與用餐結束時間；未截止前可送 QR 加點單。
5. 把 `openedAt` 改成已超過最後加點，或暫時把規則調短，確認 QR 頁停用送單，且繞過前端直接送 `POST /orders` 會回 409。
6. 回 APK 桌位地圖，確認桌卡顯示剩餘/逾時時間；用餐結束後桌卡有鬧鐘式警示。
7. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認規則、工具箱開關與桌位時間顯示都不依賴 fresh reinstall 前的本機資料。

## 線上預約訂單

預約訂單規則存在 `online_ordering` runtime，對照 iCHEF 預約訂單設定的取餐時間範圍、時間間隔與最長可預約天數。這不是 APK 本機設定，fresh reinstall 後仍應從 runtime 還原。

1. 連點工具箱 6 下進入後台編輯模式，到後台「線上點餐」開啟「允許顧客選希望時間」。
2. 在「預約訂單」區塊設定取餐時間間隔、最長預約天數與可預約時段後儲存。
3. 用消費者頁重新整理，確認希望時間欄位有最早、最晚與間隔限制；外送模式的最早時間應再加上預計車程。
4. 選擇可預約時段內的時間送單應成功；選非開放時段、超過天數或不符合間隔的時間應被前端阻擋。
5. 嘗試用 API 或已開啟的舊頁送出不合規 `requestedFulfillmentAt`，`POST /orders` 應回覆 409，不得寫入訂單。
6. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認預約規則仍從 `online_ordering` runtime 還原。

## 線上支付模組

支付模組存在 `online_ordering.paymentMethods`，對照 iCHEF 外帶/外送訂餐的支付模組設定。消費者頁付款方式顯示順序會跟隨後台排序，已停用方式不得送單；`opensCashDrawer` 會決定 POS 收款完成後是否自動開錢櫃。

1. 連點工具箱 6 下進入後台編輯模式，到後台「線上點餐」的「支付模組」區塊。
2. 停用其中一個付款方式、修改顯示名稱，必要時勾選「結帳開錢櫃」，並用上/下箭頭調整排序後儲存。
3. 用消費者頁重新整理，確認付款方式只顯示啟用項目，名稱與排序跟後台一致。
4. 選取「取餐時付款」送出訂單時，訂單應維持待收款；選 LINE Pay、街口、線上刷卡或轉帳時，訂單付款方式應保存為對應 enum。
5. 嘗試用 API 或已開啟的舊頁送出被停用的付款方式，`POST /orders` 應回覆 409，不得寫入訂單。
6. 用已勾選「結帳開錢櫃」的付款方式完成收款，確認工具箱「錢櫃管理」新增一筆 `結帳開啟 <訂單號>` 紀錄。
7. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認支付模組設定與錢櫃開啟紀錄仍從後端還原。

## 線上外送規則

外送運費規則存在 `online_ordering` runtime，對照 iCHEF 外送服務的運費規則、外送門檻、滿額免運與預計車程設定。實際訂單外送費寫入 `orders.extra_fee_amount`，不是 APK 本機資料。

1. 連點工具箱 6 下進入後台編輯模式，到後台「線上點餐」的「外送規則」區塊。
2. 設定外送費、外送最低金額、滿額免運與預計車程後儲存。
3. 用消費者頁選外送，確認合計加入外送費，付款方式只顯示 LINE Pay、街口與線上刷卡。
4. 未達外送最低金額時不得送單；達滿額免運時外送費應為 0。
5. 嘗試用 API 或已開啟的舊頁送出外送取餐時付款或轉帳，`POST /orders` 應回覆 409，不得寫入訂單。
6. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認外送規則仍從 `online_ordering` runtime 還原。

## 員工打卡

員工帳號與識別碼由後台「權限」頁的 `access_control` runtime setting 管理，打卡紀錄寫入 Supabase `staff_time_clock_entries`，不是 APK 本機資料。實機測試建議：

```bash
rtk npm run apk:debug
rtk npm run apk:install:fresh
```

1. 連點工具箱 6 下進入後台編輯模式，到後台「權限」新增或確認一位啟用員工與識別碼並儲存。
2. 回 POS 工具箱，開啟「員工打卡」，輸入識別碼，確認第一次顯示上班、第二次顯示下班。
3. 到後台「權限」刷新打卡紀錄，確認可看到員工、角色、站台與時間；到「操作稽核」確認 `員工打卡` 事件。
4. 再跑一次 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認後台仍可讀到同一批打卡紀錄，代表資料來自資料庫而不是 local storage。

## 目前營業概況與系統資訊

工具箱的「目前營業概況」與「系統資訊」只讀取既有 POS API、訂單、班別、runtime 與工作站心跳狀態，不新增 APK 本機資料。實機測試建議：

1. 開班後建立一張待收款單與一張已付款單，回工具箱開啟「目前營業概況」。
2. 確認顯示餐期起點、未結帳金額、已結帳金額，以及內用/外帶/外送拆分。
3. 開啟「系統資訊」，確認平台、POS API、工作站、線上接單、桌位圖、列印站、商品供應與班別都有值。
4. 按「重新同步」後確認資料仍來自後端；再跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認面板可重新由 Supabase/API 狀態還原。

## 交易查詢與作廢

工具箱「交易查詢與作廢」使用目前 POS API 訂單資料，不使用 APK localStorage 保存查詢結果。作廢與退款仍需後台編輯模式，並沿用既有訂單 API 與稽核事件。實機測試建議：

1. 建立一張待收款單與一張已付款單，回工具箱開啟「交易查詢與作廢」。
2. 用發票/收據號碼、桌號、訂單號碼與載具/統編條件各查一次，確認列表會篩出對應交易。
3. 點選交易，確認右側預覽顯示付款狀態、桌號、統編/載具、品項與金額。
4. 按「補印交易明細」確認列印佇列新增交易明細 print job。
5. 待收款單應可作廢，已付款或已授權單應可退款；fresh reinstall 後重新進入，交易狀態仍從資料庫還原。

## 錢櫃管理

工具箱「錢櫃管理」使用 `pos-api` 寫入 `cash_drawer.open` 稽核事件；Android APK 會透過既有 `LanPrinter` plugin 對目標列印站送 ESC/POS cash drawer pulse，Web 工作站只保留預覽紀錄。支付模組的「結帳開錢櫃」也會走同一個流程。實機測試建議：

1. 連點工具箱 6 下進入後台編輯模式，確認後台「iCHEF 補齊」已有啟用的錢櫃外設並指向目前列印站。
2. 回 POS 工具箱開啟「錢櫃管理」，輸入原因後按「開啟錢櫃並記錄」。
3. 實體錢櫃若接在收據機或出單機 DK port，應收到 pulse；若目前只接 GODEX 貼紙機，至少確認畫面顯示硬體送出或失敗狀態並寫入紀錄。
4. 另一台平板或瀏覽器開同一面板，確認可看到同一筆開啟紀錄。
5. 回後台「線上點餐」的「支付模組」勾選「結帳開錢櫃」，用該付款方式在 POS 完成收款，確認自動新增開啟紀錄。
6. 再跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，確認錢櫃開啟紀錄仍從 `/cash-drawer/events` 還原，不依賴 APK 本機資料。

## 訂位黑名單

訂位黑名單由後台「iCHEF 補齊」頁管理，資料寫入 Supabase `reservation_blacklist_entries`，不是 APK 本機資料。APK fresh reinstall 後應仍能從 `pos-api` 讀到同一份名單。

1. 連點工具箱 6 下進入後台編輯模式，到「iCHEF 補齊」新增一筆手機號碼黑名單。
2. 用同一支手機新增訂位，確認畫面先顯示黑名單原因；再次按建立才會覆蓋建立訂位。
3. 從訂位列表按「解除黑名單」與「加入黑名單」，確認專屬黑名單列表同步變更。
4. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，回到後台確認黑名單仍存在，新增訂位仍會提示。

## 線上訂位網站

線上訂位網站的開關、餐廳資訊、人數上下限、訂位間隔、提前時間、開放天數、每週時段與特殊訂位日都存在 `engagement_settings.reservationWebsite`，由 `pos-api` normalizer 提供預設值；沒有新的 APK 本機資料來源。特殊訂位日可整日不開放，或設定自訂時段取代固定時段。

1. 連點工具箱 6 下進入後台編輯模式，到「iCHEF 補齊」開啟「專屬訂位網站 / 規則」並儲存。
2. 用瀏覽器開 `?view=reservation`，確認訂位頁顯示同一份餐廳資訊與開放時段。
3. 新增一筆「整日不開放訂位」特殊訂位日並儲存，從訂位頁選該日任一時間，確認前端或公開 API 阻擋。
4. 改成「自訂時段」特殊訂位日，例如 14:00-02:00，確認該時段可訂、固定每週時段中但不在特殊時段內的時間不可訂。
5. 送出一筆符合規則的訂位，確認 `POST /reservations` 寫入 `reservations`，後台訂位列表可看到。
6. 將同一手機加入黑名單後，再從訂位頁送出，確認公開 API 顯示無法線上訂位且不新增訂位。
7. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，回後台確認訂位網站規則、特殊訂位日與黑名單仍由資料庫載入。

## 線上訂位桌位容量

公開訂位成功時會寫入 `reservations.assigned_table_ids`，並依 `floor_plan` 桌位容量、`reservationWebsite.onlineTableIds`、用餐時間與座位保留時間避免超收。APK 不保存桌位分配狀態。

1. 在後台「iCHEF 補齊」勾選可線上訂位桌位，設定用餐時間、座位保留時間與是否允許併桌後儲存。
2. 從訂位頁送出一筆符合容量的訂位，確認確認畫面與後台訂位列表顯示保留桌號。
3. 用同一時段連續送出訂位直到桌位容量用完，確認公開 API 會回覆沒有可用桌位或沒有足夠可組合桌位。
4. fresh reinstall APK 後重新進入後台，確認已分配桌號仍從 `reservations.assigned_table_ids` 顯示。

## POS 訂位管理

平板 POS 工具箱的「訂位管理」會讀寫 Supabase `reservations`，不是 APK 本機資料。日/週/月檢視、狀態篩選、排桌、修改時間/桌位/人數/訂位人資訊、已發送提醒、已保留訂位、取消、未出席與帶位開單都應跨 fresh reinstall 保留。

1. 在 APK 開啟工具箱，進入「訂位管理」，確認今日訂位可同步，日/週/月切換會依區間重新載入。
2. 從 POS 新增一筆訂位並勾選桌位，確認另一台平板或後台重新整理後可看到同一筆資料與桌號。
3. 點「修改」，改日期時間、人數、桌位、狀態、訂位人資訊、標籤與店內備註後儲存；另一台平板重新整理後應看到同一筆更新，不得回到修改前資料。
4. 將訂位依序改為「已發送提醒」與「已保留訂位」，確認狀態篩選、今日訂位數、遲到提醒與桌位容量判斷仍把這兩種狀態視為有效訂位。
5. 製造同桌重疊或人數超過桌位容量的訂位，確認列表出現「桌位重疊」或「座位數不足」提醒。
6. 將訂位時間調整到目前時間前後可測範圍，確認「帶位開單」會建立內用草稿單、帶入顧客資料與備註，且訂位狀態改為 `seated`。
7. 準備一筆已超過台北時間隔兩天凌晨 1 點門檻且仍為 `booked`、`reminded` 或 `confirmed` 的訂位，重新整理後應自動變成 `no_show`，且不再占用桌位容量。
8. fresh reinstall APK 後重新進入「訂位管理」，確認訂位列表、修改後資訊、入座狀態、自動未出席狀態與桌位圖下一組訂位標示仍從資料庫還原。

## 測試重點

- APK 目前是 debug 版，只用於平板測試，不用於正式上架。
- APK 是門市平板工作站，只顯示櫃台點餐、線上訂單接單、立即出單、商品暫停供應、單一品項暫停出單與列印站操作；消費者線上點餐維持 Web / GitHub Pages 入口，不出現在 APK 裡。
- APK 會載入同一套門市 POS 與 Supabase `pos-api`，可測試訂單同步、多平板鎖定、收銀開關班、現金臨時收支、依後台規則拆分的 `print_jobs` 與 Android TCP socket 列印 POC。
- 測訂位黑名單時，新增/解除名單與從訂位列切換都應透過 `/admin/reservation-blacklist` 寫入資料庫；fresh reinstall 後不得靠本機快取才能顯示。
- 測線上訂位網站時，後台規則應透過 `/settings/runtime` 同步，公開送單應走 `/reservations`；特殊訂位日必須由前端與 API 同時阻擋或開放，黑名單手機不得只在前端阻擋。
- 測線上訂位容量時，需檢查同時段 booked/reminded/confirmed/seated 訂位與 assigned table，而不是只看總人數欄位；沒有 assigned table 的舊訂位會以人數保守占用容量。
- 測 POS 訂位管理時，新增訂位、修改時間/桌位/人數/訂位人資訊、已發送提醒、已保留訂位、取消、未出席、自動未出席與帶位開單都應透過 `/admin/reservations` 寫入；帶位開單後的內用草稿單會進既有訂單草稿資料流，fresh reinstall 後訂位狀態不得回到 booked。
- 測付款拆單時，子單必須寫入 `orders.payment_splits`；另一台平板、App 重開與 fresh reinstall 都要看到同一子單數、未結張數、付款方式與已結狀態。
- 測關帳員工識別碼時，`POST /register/close` 必須帶 `staffCode`，並由 `access_control.staffAccounts` 驗證啟用員工與 `closeRegister` 角色權限；操作員資料應只出現在 `pos_audit_events.register.close` metadata，不應保存在 APK localStorage。
- 測 POS 操作權限驗證時，`access_control.protectedPermissions` 必須由 `/settings/runtime` 同步成低敏感 `accessPolicy`；被保護操作要呼叫 `/access/verify`，無權限員工不得通過，fresh reinstall 後不得靠本機記憶體保存驗證開關。
- 測結帳相關權限時，結帳/標記已收款應檢查 `checkoutOrders`，調整服務費或其他費用應檢查 `adjustServiceCharges`，套用手動折扣、點數或優惠券應檢查 `applyManualDiscounts`，且都只能寫 `access.verify` 稽核，不應把通過狀態存在 APK localStorage。
- 測工具箱標籤管理時，新增、改名、調整顏色或刪除標籤後必須寫入 `engagement_settings.orderLabels`；點餐頁標籤列與送出後的 `orders.order_labels` 應跟同一份設定一致，fresh reinstall 後不得靠本機快取顯示。
- 測工具箱裝置管理時，出單機清單應來自 `printer_settings.stations`，刷卡/掃碼/錢櫃外設應來自 `engagement_settings.hardwareDevices`，未印出單據應來自訂單 `print_jobs`；取消未印出單據後 fresh reinstall 不得再次看到已刪除的 print jobs。
- 測工具箱顧客資訊管理時，搜尋、類型篩選、排序與新增顧客都應走 `GET/POST /admin/members`；新增後點餐頁 CRM 搜尋與後台會員錢包應看到同一位顧客，fresh reinstall 後不得靠本機快取顯示。
- 測混合支付時，付款分配必須寫入 `orders.payment_breakdown`，交易明細張數必須寫入 `orders.transaction_receipt_count`；關帳付款方式金額要依分配後金額計算。
- 測優惠活動時，後台規則必須寫入 `discount_settings` runtime；POS 與線上點餐需套用同一份計算器，外送門檻/免運與 `pos-api` 建單都要用折抵後金額重新驗證。
- 測會員優惠券時，使用券必須把 `member_coupons.status` 改成 `redeemed` 並記錄 `redeemed_order_id`；另一台平板不得重複使用同一張券，作廢或退款後才可退回 active。
- 測線上結帳統編/載具時，欄位顯示由 `online_ordering` runtime 決定，資料必須寫入 `orders.tax_id` 與 `orders.invoice_carrier_barcode`；fresh reinstall 後不得靠本機快取才能顯示。
- 測內用掃碼結帳流程時，`online_ordering.dineInCheckout` 應控制先結/後結；後結 QR 內用頁不得顯示付款方式且 API 會寫入現場待收款，先結 QR 內用頁只能顯示線上付款且 API 必須拒絕現場付款。
- 測線上服務方式開關時，自取、內用掃碼與外送應由 `online_ordering.serviceModeAvailability` 控制；前端停用按鈕只是 UX，`POST /orders` 仍必須拒絕 disabled service mode。
- 測訂單 QR 自動列印時，後台「線上點餐」的開關、指定出單機與 Logo 文字應寫入 `online_ordering.sessionQrCode`；fresh reinstall 後建立內用桌位訂單仍應用同一設定建立 QR `print_jobs`，並由 APK `LanPrinter` 送到指定出單機。
- 測線上預約訂單時，取餐時間間隔、最長預約天數與可預約時段應由 `online_ordering` runtime 控制；`POST /orders` 仍必須拒絕不合規 `requestedFulfillmentAt`。
- 測線上支付模組時，付款方式顯示、名稱與順序應由 `online_ordering.paymentMethods` 控制；停用付款方式後，前端不顯示且 `POST /orders` 應拒絕。
- 測線上外送規則時，外送費、外送最低金額、滿額免運與預計車程應由 `online_ordering` runtime 控制；外送不得顯示取餐時付款或轉帳，`POST /orders` 仍必須依 runtime 重新計算 `extra_fee_amount`。
- 測外帶/外送快速出店時，來源與完成時間篩選只應批次更新已付款且到點的外帶/外送單；狀態必須透過 `/orders/:id/status` 寫成 `served`，fresh reinstall 後不得回到待處理佇列。
- 測現金臨時收支時，先進入後台編輯模式並開班，在關帳頁登記收入/支出；fresh reinstall 後本機資料會被清掉，但重新載入 `/register/current` 仍應看到 Supabase `register_cash_adjustments` 的同一批紀錄與含臨時收支的預期現金。
- 測逐筆暫停出單時，先在購物車品項列按「暫停」，再按「出單」或「結帳」；該品項仍應留在訂單金額與結帳流程，但 EZPL preview、`print_jobs` payload 與 Android TCP payload 不應包含該明細。若先建草稿再換平板或 fresh reinstall，草稿 `draft_lines.printPaused` 也應保留暫停狀態。
- 測 iCHEF 商品總數設定時，先在後台「iCHEF 補齊」開啟「顯示商品總數」，再把袋子/包材加入 `engagement_settings.productTotalDisplay.excludedItemIds` 或不計算分類；APK 點餐票券、付款摘要與訂單明細應顯示排除後的商品總數。此設定不得影響 GoDEX 已裁貼紙序號，fresh reinstall 後仍應由 `/settings/runtime` 還原。
- 測 iCHEF 服務費設定時，先在後台「iCHEF 補齊」開啟服務費，設定服務費名稱、內用/外帶/外送費率、折扣前/折扣後計算與不計算分類/品項；APK 付款頁應依目前服務方式帶入預設費率，服務費名稱與金額需同步更新。線上/QR 訂單送出後，`pos-api` 仍要依 `engagement_settings.serviceCharge` 重新計算 `service_fee_rate` 與 `service_fee_amount`；fresh reinstall 後所有規則仍應由 `/settings/runtime` 還原。
- 測已裁貼紙「不計算商品」時，先在後台或列印站把袋子/包材加進 `countExcludedItemIds` 或不計算分類；APK 出單後飲品貼紙應用排除後的總數顯示 `1/2`、`2/2`，不計算品項若仍列印則顯示 `NC/2`，fresh reinstall 後規則仍由 Supabase runtime 還原。
- 測印單時機時，先在列印站把某條規則只保留「出單」或只保留「重印」並儲存；APK 初次按「出單」與訂單列再按「重印」應分別只套用符合 `printer_settings.rules[].timings` 的規則，fresh reinstall 後設定仍由 `/settings/runtime` 還原。
- 測 iCHEF 式手動列印時，在外帶/外送訂單列或右側 Next 訂單區按「QR」與「顧客聯」；兩個按鈕都應建立 `print_jobs`、更新列印佇列並在 APK 內透過 `LanPrinter` TCP 送出。掃描 QR 後應進入 `order.scriptcoffee.com.tw` 的 QR 點餐入口，送出的訂單來源應為 `qr`。
- APK 已包含 `LanPrinter` native plugin 與 `OnlineOrderNotifier` native plugin；瀏覽器版仍只能測 EZPL 預覽、`print_jobs` 建立與 Browser Notification fallback，實際 GODEX TCP 列印與可靠背景提醒要在 APK 內測。
- 平板需要可連網，才能連到 Supabase。
- 未來實機列印時，平板與 GODEX DT2X 必須在同一個 Wi-Fi / LAN，且出單機 IP 要與後台設定一致。
