# 區域網路列印 POC

## 目標

確認 Samsung Tab A11+ 安裝的 Capacitor APK 可以在同一個 Wi-Fi 網段內，直接對 GODEX DT2X 固定 IP 傳送 EZPL 列印指令。

## 預設網路

- 出單機：`192.168.1.100`
- Port：`9100`
- Protocol：TCP socket
- Payload：EZPL

## Phase 2 驗證步驟

1. 店內路由器替 GODEX DT2X 綁定固定內網 IP。
2. Vue POS 會優先讀取 `/settings/runtime` 的啟用出單機；`.env.local` 的 `VITE_POS_PRINTER_HOST` 與 `VITE_POS_PRINTER_PORT` 只作為本機 fallback。
3. 加入 Capacitor：

```bash
rtk npm install @capacitor/core @capacitor/cli @capacitor/android
rtk npx cap init
rtk npx cap add android
```

4. 加入 TCP socket 外掛後，建立最小列印測試頁。
5. 在平板安裝 APK，送出 healthcheck label。
6. 成功後再把列印結果接回 `print_jobs` 狀態。

## 後台設定邊界

- `pos_settings.printer_settings` 保存出單機、服務方式、商品類別、單據類型與份數。
- 前台目前先使用第一台啟用的出單機建立 `print_jobs`。
- Phase 2 APK 需要依印單規則拆分貼紙/收據，再依規則回寫列印結果。

## 重要限制

- 瀏覽器網頁通常不能直接對內網 IP 開 TCP socket；實機列印應以 Capacitor APK 驗證。
- GitHub Pages 只承載 Web POS，不負責硬體連線。
- 若未來多台平板共用一台出單機，`print_jobs` 需要避免重複出單。
