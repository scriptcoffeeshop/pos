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
rtk npm run cap:sync
rtk npm run apk:debug
```

4. APK 內已加入 `LanPrinter` Capacitor native plugin，會透過 Android TCP socket 送出 EZPL payload。
5. 在平板安裝 APK，按 POS 列印站的印表機按鈕送出 healthcheck label；畫面會顯示預覽與 TCP 狀態，但送到 GODEX 的內容是純 EZPL payload。
6. 建立櫃台訂單時，若有符合目前服務方式、商品分類或指定品項與貼紙設定的啟用規則，前端會依規則拆成多筆 EZPL payload 與 `print_jobs`；未被規則納入的品項不會列印，Android APK 會逐筆嘗試送出 EZPL，再回寫 `printed` 或 `failed`。

## 後台設定邊界

- `pos_settings.printer_settings` 保存出單機、服務方式、商品類別、指定品項、單據類型與份數。
- 前台會讀取 runtime 出單規則，依規則選擇啟用且自動列印的出單機。
- 同一張訂單可依規則拆成貼紙、收據與多份 copies；瀏覽器版建立雲端 `print_jobs` 並顯示預覽，Android APK 則逐筆送出 TCP payload 並回寫列印結果。

## 重要限制

- 瀏覽器網頁通常不能直接對內網 IP 開 TCP socket；實機列印應以 Capacitor APK 驗證。
- GitHub Pages 只承載 Web POS，不負責硬體連線。
- 若未來多台平板共用一台出單機，`print_jobs` 需要避免重複出單。
- 若 Android TCP socket 連線失敗，POS 會把該 `print_jobs` 記為 `failed`，並在列印預覽中顯示錯誤訊息。
