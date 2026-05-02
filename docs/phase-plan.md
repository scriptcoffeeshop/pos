# 階段性開發計畫

## Phase 1：基礎建設與資料庫設計

- 建立 GitHub repo、CI、GitHub Pages 部署鏈。
- 建立消費者線上點餐頁，並以 `order.scriptcoffee.com.tw` 作為 Pages custom domain 目標。
- 建立 Supabase schema：商品、訂單、訂單明細、會員、交易日誌、列印任務。
- 建立 Edge Function skeleton，先支援訂單建立與狀態更新。
- 建立 PIN 保護的後台商品管理入口，先支援前台商品顯示、價格、排序與停售。
- 補齊後台商品菜單通路、庫存/低庫存欄位、暫停供應至、出單機規則與角色權限模型，作為 iCHEF/肚肚式營運後台基礎；建單已透過 `create_pos_order()` 原子扣庫存，避免多平板超賣。
- 規劃 LINE Login profile 與會員資料邊界。

## Phase 2：Capacitor LAN Printing POC

- 封裝 Android APK。已完成 Capacitor Android 專案與 debug APK workflow。
- 建立 GitHub Actions debug APK artifact，讓平板可先測 POS app 外殼。
- 對 GODEX DT2X 固定 IP 送出 EZPL 測試 payload。已加入 Android `LanPrinter` TCP socket plugin，POS 列印站按鈕會送出純 EZPL healthcheck label，待實機驗證。
- 驗證列印成功後的狀態回寫。已接 `print_jobs` 的 `printed` / `failed` 回寫流程，待實機確認。
- POS 佇列已顯示列印 job 次數、重印入口與失敗訊息；待實機確認 GODEX TCP 回寫穩定性。
- 多平板共用出單機的鎖定策略已進入第一版：`orders` 會保存 claim lease，狀態更新與 `print_jobs` 建立前都需要同一台平板持有有效 lease；平板在線心跳已寫入 `pos_station_heartbeats`，後續可再補 realtime 訂閱。
- 依後台印單規則決定收據、貼紙、品項類別與出單機。已接入前台列印計畫與多筆 `print_jobs`，待實機校正 EZPL 版面。

## Phase 3：顧客端線上點餐與金流

- 商品展示、購物車、結帳流程。
- LINE Pay 與街口支付正式環境串接。Webhook 冪等事件表、provider-neutral `/payments/webhook/:provider` 與後台「支付事件」provider/狀態篩選、CSV 匯出已完成，後續只需接正式 provider 簽章驗證與 payload mapping。
- 支付逾期已在 `GET /orders` 自動標記線上/QR 待付款新單為 `status=failed`、`payment_status=expired`；late paid webhook 可回復為已付款，失敗/逾期 webhook 不會覆蓋已付款單。

## Phase 4：店內 POS 與進階功能

- 平板專用操作介面完善。
- 收款確認已接入 POS 佇列與下一張單，可把待收款/已授權訂單更新為已付款，並同步更新班別摘要。
- 未收款訂單作廢已接入 POS 佇列與下一張單，需管理 PIN，會排除關帳/班別統計；已收款訂單退款已接 `refund_pos_order()`，會同步寫入負數交易流水。
- 正式班別/收銀機 session 已接第一版：`register_sessions` 保存開班/關班、開班現金、實點現金、預期現金、現金銷售、非現金、待收款、單數與關帳異常計數；開關班需 `POS_ADMIN_PIN`。
- 營運日報已接第一版：後台可用 PIN 查詢指定日期的實收、待收、退款、異常、付款方式、來源、服務方式、時段與熱門商品。
- 會員儲值與 transaction ledger 已接第一版後台：可建立會員、查詢餘額與寫入儲值/扣款流水，後續接 LINE Login 綁定與會員付款扣款。
- 外送欄位已接第一版：線上與櫃台訂單可保存希望時間與外送地址，POS 佇列與收據 payload 會顯示；POS 佇列已可展開消費明細、客資、履約與備註，後續補未來多店支援。

## 影片 UI/UX 導入順序

2026-05-02 參考 iCHEF 操作影片後，採用「不改預設色系、先落地高頻櫃台操作」的導入順序。

### 已立即落地

- POS 工具箱：從右側工具列或點餐票券開啟，集中新增外帶、訂單查詢、供應狀態、列印站、班別、後台、線上入口與重新同步。
- 外觀偏好：本機保存文字大小與畫面密度，讓平板工作站可在標準/放大、標準/緊湊之間切換。
- 訂單查詢進階條件：在既有待處理/可交付/全部與付款篩選之外，加入日期、取餐方式、來源與排序。
- 供應狀態常駐：商品暫停/恢復入口從 Native-only 改成 POS 列印/前台操作頁固定可見，仍維持 PIN 保護。
- 供應狀態批次操作：支援依搜尋、分類與狀態篩選後批次暫停/恢復商品，仍沿用單品更新 API 與稽核紀錄。
- 瀏覽紀錄/打卡型營運工具：後台新增營運紀錄時間線，復用現有稽核事件與平板心跳資料，支援搜尋、類型/平板篩選與 CSV 匯出。
- 線上點餐設定面板：新增 `online_ordering` runtime setting 與後台面板，控制外帶外送接單、預約開關、平均備餐時間、未確認提醒與提示音；消費者頁與建單 API 都會遵守暫停/預約設定。

### 下一批

- 線上點餐提示音實際播放與新單未確認提醒：目前已保存設定，後續要接平板前景/背景播放限制與佇列提醒 UI。

### 後續評估

- 內建知識庫/協助入口：若未來有 SOP 或新人訓練文件，再接成可搜尋的門市知識庫。
- 更完整的通知音與提示模式：需先確認平板瀏覽器/APK 對背景播放、音量與系統通知的限制，再做正式開關。
