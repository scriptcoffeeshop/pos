# 平板測試流程

## 本機開發測試

1. 讓 Mac 與平板連到同一個 Wi-Fi。
2. 在 Mac 啟動開發伺服器：

```bash
rtk npm run dev
```

3. 另開一個終端機取得平板網址：

```bash
rtk npm run tablet:url
```

4. 在平板瀏覽器開啟輸出的 `http://<Mac 區網 IP>:5173/`。
5. 如果平板無法連線，依序確認：
   - Mac 與平板是否同網段。
   - macOS 防火牆是否允許 Node / Vite 連入。
   - 開發伺服器是否仍在執行。
   - 平板是否被 Wi-Fi AP 的 client isolation 阻擋。

## 雙平板同步自動實測

可先跑本機 smoke，讓腳本啟動假 POS API、Vite 與兩個獨立瀏覽器 context 來模擬兩台平板：

```bash
rtk npm run smoke:dual-tablet
```

此 smoke 會加速 `VITE_POS_QUEUE_SYNC_INTERVAL_MS`，並驗證：

- 桌位地圖與候位從平板 A 寫入後，平板 B 可同步看到。
- 兩台平板同時接同一張線上單時，claim lease 只能有一台成功。
- 任一平板按「稍後提醒」後，另一台不再提醒同一張線上單。
- POS API 斷線後恢復時，平板會靠 fallback polling 拉回最新 runtime 設定。

截圖會輸出到 `output/playwright/dual-tablet-a-final.png` 與 `output/playwright/dual-tablet-b-final.png`。這是本機可重跑的同步回歸；實機 APK 背景通知、熄屏與 fresh reinstall 仍需照下面 APK 測試流程補測。

## 公開網址測試

GitHub Pages 啟用後，可直接用公開網址在平板瀏覽器測試消費者線上點餐。`order.scriptcoffee.com.tw` 會預設開啟線上點餐頁；內部 POS / 後台仍建議用本機網址測試。

## APK 測試

若要用 Android App 形式測試，請看 [Android APK 測試流程](android-apk.md)。debug APK 是門市平板工作站，只顯示櫃台點餐、線上訂單接單、立即出單、商品暫停供應、單一品項暫停出單與 Android TCP socket 列印 POC；消費者線上點餐不會出現在 APK 裡。

## 多平板線上新單提醒

線上/掃碼新單提醒的「稍後」「已讀」「接單」「拒絕接單」狀態會寫入 Supabase `online_order_reminder_states`，並透過 `pos_realtime_events` 的 `online_order_reminders` topic 讓其他平板重拉 `/online-order-reminders/state`。測試時至少準備兩台平板或一台 APK 加一個瀏覽器視窗：

1. 送出一張線上或 QR 新單，確認兩邊都看到同一張待接單提醒。
2. 在其中一台按「稍後」，確認另一台提醒同步消失；重開 App、回前景與 fresh reinstall 後仍不會立刻再提醒，直到 snooze 到期。
3. 再送新單，分別測「已讀」「接單」「拒絕接單」，確認另一台、APK 重開、回前景與 fresh reinstall 後都不再提醒同一張單。
4. 讓 APK 進背景或熄屏後送單，確認 Android foreground service 顯示背景接單常駐通知，並由 `線上/掃碼新單提醒` notification 提醒新單；logcat 應看到 `posting foreground service notification signature=...`，且通知遵守同一份共享狀態，而不是只看本機記憶體。
5. 回前景時先觀察不應有舊單提示音或橫幅閃現；POS 應先重拉 `/online-order-reminders/state`，再決定是否恢復提醒。

## 多平板班別現金臨時收支

現金臨時收支會寫入 Supabase `register_cash_adjustments`，不是 localStorage。測試時至少準備兩個工作站視窗或一台 APK 加一個瀏覽器：

1. 連點工具箱 6 下進入後台編輯模式，在關帳頁確認已有開班；沒有開班時先填開班現金並開班。
2. 在平板 A 的「現金臨時收支」登記一筆收入，例如找零補入，再登記一筆支出，例如食材採買。
3. 確認平板 A 的預期現金、臨時收入、臨時支出、臨時淨額與最近紀錄立即更新。
4. 確認平板 B 不用重整也會透過 `register_sessions` realtime invalidation 重拉 `/register/current`，看到同一批紀錄與預期現金。
5. fresh reinstall APK 或清除瀏覽器資料後重新登入 POS，確認同一班別仍能看到現金異動，且關班實點現金會用含臨時收支的預期現金計算差額。
6. 到後台「操作稽核」刷新，確認可看到 `現金臨時收支` 事件與原因、類型、金額。

## 多平板員工打卡

員工帳號與打卡紀錄走 `pos-api` 與 Supabase，不應依賴 localStorage。測試時至少準備兩個工作站視窗或一台 APK 加一個瀏覽器：

1. 連點工具箱 6 下進入後台編輯模式，到後台「權限」新增一位啟用員工、設定識別碼與角色並儲存。
2. 在平板 A 的工具箱開啟「員工打卡」，輸入識別碼，確認顯示上班打卡。
3. 在平板 B 到後台「權限」刷新打卡紀錄，確認看到同一筆上班紀錄；再從平板 B 用同一識別碼打卡，確認變成下班。
4. fresh reinstall APK 或清除瀏覽器資料後重新進入 POS，確認後台仍能讀到同一批 `staff_time_clock_entries`，且操作稽核可看到 `員工打卡`。

## 列印測試邊界

瀏覽器版 POS 可以測試 EZPL 預覽與 Supabase `print_jobs` 建立，但不能直接用瀏覽器對 GODEX DT2X 開 TCP socket。實機區網列印要用 Capacitor Android APK；APK 會在平板內透過 `LanPrinter` native plugin 連到後台設定的出單機 IP 與 port。

逐筆暫停出單測試：在購物車加入至少兩個品項，將其中一個品項切成「暫停」，確認結帳金額仍包含該品項，但出單 preview、`print_jobs` payload 與 APK TCP 列印只包含未暫停的品項。若先建櫃台草稿再換另一台平板或 fresh reinstall，該品項的暫停狀態也應從 Supabase 草稿恢復。

手動 QR / 顧客聯測試：在訂單中心展開一張已有品項的訂單，分別按「QR」與「顧客聯」，確認兩者都建立 `print_jobs` 並出現在列印佇列。QR payload 需包含 `order.scriptcoffee.com.tw?source=qr`；掃碼送單後，POS 佇列中的來源應顯示為「掃碼」。

## 後台編輯模式

平板或電腦上的 POS 介面連點工具箱 6 下後會進入後台編輯模式，才能開啟供應狀態、後台、作廢/退款與開關班等管理操作。`pos-api` 管理端點會沿用這個前台操作閘門，不再要求額外密碼欄位。
