# Android APK 測試流程

## 產出 APK

### GitHub Actions

這是目前建議方式，因為本機還沒有 Java 與 Android SDK。

1. 到 GitHub repo 的 Actions。
2. 選擇 `Android APK` workflow。
3. 按 `Run workflow`。
4. 等 `Build debug APK` 完成。
5. 在 workflow run 的 Artifacts 下載 `script-coffee-pos-debug-apk`。
6. 解壓縮後會得到 `app-debug.apk`。

### 本機建置

本機需要先安裝 JDK 21、Android Studio / Android SDK，並設定好 Android SDK path。完成後執行：

```bash
rtk npm run apk:debug
```

APK 位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

若平板已用 USB 連到 Mac 並開啟 USB 偵錯，可直接安裝：

```bash
rtk npm run apk:install
```

## 平板安裝

1. 將 `app-debug.apk` 傳到 Samsung 平板。
   - 可用 USB 傳檔、雲端硬碟、Telegram、LINE 檔案傳送，或 ADB 安裝。
2. 在平板允許安裝未知來源 App。
   - Samsung 常見路徑：`設定` → `安全性與隱私權` → `更多安全性設定` → `安裝未知的應用程式`。
   - 選擇你用來開啟 APK 的 App，例如 `Chrome`、`我的檔案` 或雲端硬碟 App，開啟允許。
3. 點開 `app-debug.apk`，選擇安裝。
4. 安裝完成後開啟 `Script Coffee POS`。

## 測試重點

- APK 目前是 debug 版，只用於平板測試，不用於正式上架。
- 目前 APK 會載入同一套 Web POS 與 Supabase `pos-api`，可測試 POS、後台、訂單同步與列印工作建立。
- 實際 GODEX TCP 列印仍需下一步加入 Capacitor TCP socket 外掛，現在只能測 EZPL 預覽與 `print_jobs` 建立。
- 平板需要可連網，才能連到 Supabase。
- 未來實機列印時，平板與 GODEX DT2X 必須在同一個 Wi-Fi / LAN，且出單機 IP 要與後台設定一致。
