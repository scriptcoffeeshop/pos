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

GitHub Pages 啟用後，可直接用公開網址在平板測試 Web POS 與消費者線上點餐。`order.scriptcoffee.com.tw` 會預設開啟線上點餐頁；內部 POS / 後台仍建議用本機網址或 APK 測試。

## APK 測試

若要用 Android App 形式測試，請看 [Android APK 測試流程](android-apk.md)。目前 debug APK 可測 POS app 外殼、Supabase 同步與後台；實機 TCP 列印仍需後續加入 Capacitor TCP socket 外掛。

## 列印測試邊界

瀏覽器版 POS 可以測試 EZPL 預覽與 Supabase `print_jobs` 建立，但不能直接用瀏覽器對 GODEX DT2X 開 TCP socket。實機區網列印要等 Phase 2 的 Capacitor Android APK；APK 會在平板內透過 TCP socket 連到 `VITE_POS_PRINTER_HOST:VITE_POS_PRINTER_PORT`。

## 後台 PIN

後台商品管理需要 Supabase Edge Function secret：

```bash
rtk supabase secrets set POS_ADMIN_PIN=<your-pin> --project-ref uuzwcmceotooocyrtnao
```

設定後重新部署 `pos-api`，平板或電腦上的後台才能用該 PIN 載入與儲存完整商品清單。
