# 階段性開發計畫

## Phase 1：基礎建設與資料庫設計

- 建立 GitHub repo、CI、GitHub Pages 部署鏈。
- 建立消費者線上點餐頁，並以 `order.scriptcoffee.com.tw` 作為 Pages custom domain 目標。
- 建立 Supabase schema：商品、訂單、訂單明細、會員、交易日誌、列印任務。
- 建立 Edge Function skeleton，先支援訂單建立與狀態更新。
- 建立 PIN 保護的後台商品管理入口，先支援前台商品顯示、價格、排序與停售。
- 補齊後台商品菜單通路、出單機規則與角色權限模型，作為 iCHEF/肚肚式營運後台基礎。
- 規劃 LINE Login profile 與會員資料邊界。

## Phase 2：Capacitor LAN Printing POC

- 封裝 Android APK。已完成 Capacitor Android 專案與 debug APK workflow。
- 建立 GitHub Actions debug APK artifact，讓平板可先測 POS app 外殼。
- 對 GODEX DT2X 固定 IP 送出 EZPL 測試 payload。已加入 Android `LanPrinter` TCP socket plugin，待實機驗證。
- 驗證列印成功後的狀態回寫。已接 `print_jobs` 的 `printed` / `failed` 回寫流程，待實機確認。
- 設計多平板共用出單機的鎖定策略。
- 依後台印單規則決定收據、貼紙、品項類別與出單機。

## Phase 3：顧客端線上點餐與金流

- 商品展示、購物車、結帳流程。
- LINE Pay 與街口支付正式環境串接。
- 支付逾期自動標記 `status=failed`、`payment_status=expired`。

## Phase 4：店內 POS 與進階功能

- 平板專用操作介面完善。
- 會員儲值與 transaction ledger。
- 消費明細、外送欄位與未來多店支援。
