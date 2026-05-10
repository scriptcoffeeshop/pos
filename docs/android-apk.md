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

## 訂位黑名單

訂位黑名單由後台「iCHEF 補齊」頁管理，資料寫入 Supabase `reservation_blacklist_entries`，不是 APK 本機資料。APK fresh reinstall 後應仍能從 `pos-api` 讀到同一份名單。

1. 連點工具箱 6 下進入後台編輯模式，到「iCHEF 補齊」新增一筆手機號碼黑名單。
2. 用同一支手機新增訂位，確認畫面先顯示黑名單原因；再次按建立才會覆蓋建立訂位。
3. 從訂位列表按「解除黑名單」與「加入黑名單」，確認專屬黑名單列表同步變更。
4. 跑 `rtk npm run apk:install:fresh` 後重新開啟 APK，回到後台確認黑名單仍存在，新增訂位仍會提示。

## 測試重點

- APK 目前是 debug 版，只用於平板測試，不用於正式上架。
- APK 是門市平板工作站，只顯示櫃台點餐、線上訂單接單、立即出單、商品暫停供應、單一品項暫停出單與列印站操作；消費者線上點餐維持 Web / GitHub Pages 入口，不出現在 APK 裡。
- APK 會載入同一套門市 POS 與 Supabase `pos-api`，可測試訂單同步、多平板鎖定、收銀開關班、現金臨時收支、依後台規則拆分的 `print_jobs` 與 Android TCP socket 列印 POC。
- 測訂位黑名單時，新增/解除名單與從訂位列切換都應透過 `/admin/reservation-blacklist` 寫入資料庫；fresh reinstall 後不得靠本機快取才能顯示。
- 測現金臨時收支時，先進入後台編輯模式並開班，在關帳頁登記收入/支出；fresh reinstall 後本機資料會被清掉，但重新載入 `/register/current` 仍應看到 Supabase `register_cash_adjustments` 的同一批紀錄與含臨時收支的預期現金。
- 測逐筆暫停出單時，先在購物車品項列按「暫停」，再按「出單」或「結帳」；該品項仍應留在訂單金額與結帳流程，但 EZPL preview、`print_jobs` payload 與 Android TCP payload 不應包含該明細。若先建草稿再換平板或 fresh reinstall，草稿 `draft_lines.printPaused` 也應保留暫停狀態。
- 測 iCHEF 式手動列印時，在外帶/外送訂單列或右側 Next 訂單區按「QR」與「顧客聯」；兩個按鈕都應建立 `print_jobs`、更新列印佇列並在 APK 內透過 `LanPrinter` TCP 送出。掃描 QR 後應進入 `order.scriptcoffee.com.tw` 的 QR 點餐入口，送出的訂單來源應為 `qr`。
- APK 已包含 `LanPrinter` native plugin 與 `OnlineOrderNotifier` native plugin；瀏覽器版仍只能測 EZPL 預覽、`print_jobs` 建立與 Browser Notification fallback，實際 GODEX TCP 列印與可靠背景提醒要在 APK 內測。
- 平板需要可連網，才能連到 Supabase。
- 未來實機列印時，平板與 GODEX DT2X 必須在同一個 Wi-Fi / LAN，且出單機 IP 要與後台設定一致。
