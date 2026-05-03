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

## 測試重點

- APK 目前是 debug 版，只用於平板測試，不用於正式上架。
- APK 是門市平板工作站，只顯示櫃台點餐、線上訂單接單、立即出單、商品暫停供應與列印站操作；消費者線上點餐維持 Web / GitHub Pages 入口，不出現在 APK 裡。
- APK 會載入同一套門市 POS 與 Supabase `pos-api`，可測試訂單同步、多平板鎖定、收銀開關班、依後台規則拆分的 `print_jobs` 與 Android TCP socket 列印 POC。
- APK 已包含 `LanPrinter` native plugin；瀏覽器版仍只能測 EZPL 預覽與 `print_jobs` 建立，實際 GODEX TCP 列印要在 APK 內測。
- 平板需要可連網，才能連到 Supabase。
- 未來實機列印時，平板與 GODEX DT2X 必須在同一個 Wi-Fi / LAN，且出單機 IP 要與後台設定一致。
