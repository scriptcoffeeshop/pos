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

## 公開網址測試

GitHub Pages 啟用後，可直接用公開網址在平板瀏覽器測試消費者線上點餐。`order.scriptcoffee.com.tw` 會預設開啟線上點餐頁；內部 POS / 後台仍建議用本機網址測試。

## APK 測試

若要用 Android App 形式測試，請看 [Android APK 測試流程](android-apk.md)。debug APK 是門市平板工作站，只顯示櫃台點餐、線上訂單接單、立即出單、商品暫停供應與 Android TCP socket 列印 POC；消費者線上點餐不會出現在 APK 裡。

## 多平板線上新單提醒

線上/掃碼新單提醒的「稍後」「已讀」「接單」「拒絕接單」狀態會寫入 Supabase `online_order_reminder_states`，並透過 `pos_realtime_events` 的 `online_order_reminders` topic 讓其他平板重拉 `/online-order-reminders/state`。測試時至少準備兩台平板或一台 APK 加一個瀏覽器視窗：

1. 送出一張線上或 QR 新單，確認兩邊都看到同一張待接單提醒。
2. 在其中一台按「稍後」，確認另一台提醒同步消失；重開 App 後仍不會立刻再提醒，直到 snooze 到期。
3. 再送新單，分別測「已讀」「接單」「拒絕接單」，確認另一台和重開後都不再提醒同一張單。
4. 讓 APK 進背景或熄屏後送單，確認 Android notification 也遵守同一份共享狀態，而不是只看本機記憶體。

## 列印測試邊界

瀏覽器版 POS 可以測試 EZPL 預覽與 Supabase `print_jobs` 建立，但不能直接用瀏覽器對 GODEX DT2X 開 TCP socket。實機區網列印要用 Capacitor Android APK；APK 會在平板內透過 `LanPrinter` native plugin 連到後台設定的出單機 IP 與 port。

## 後台編輯模式

平板或電腦上的 POS 介面連點工具箱 6 下後會進入後台編輯模式，才能開啟供應狀態、後台、作廢/退款與開關班等管理操作。`pos-api` 管理端點會沿用這個前台操作閘門，不再要求額外密碼欄位。
