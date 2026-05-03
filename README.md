# Script Coffee POS

Script Coffee POS 是門市平板點餐、線上訂單中樞與 GODEX DT2X 區域網路列印的初始專案。第一版已建立 Vue 3 + Vite + TypeScript 前端工作台，並接上獨立 Supabase `pos-api` 作為商品、訂單與列印工作的後端入口；後續再接 LINE Login、LINE Pay / 街口支付與 Capacitor Android APK。

## 初版範圍

- 門市 POS 第一屏：工作站進入後預設顯示接近 iCHEF Server 的簡潔「桌況頁」，右側導航列目前只保留底部「工具箱」入口，主畫面上方可直接按「新增外帶」進入點餐；點餐頁改為接近 iCHEF 出單畫面的「左側外帶票券、右側分類列與商品大方塊」雙區塊。新增外帶會立即建立可見佇列訂單並依序給 `001`、`002`，即使尚未加入品項，回到桌況頁仍保留該單；點桌況頁上的櫃台訂單可回購物車繼續編輯品項，櫃台自己建立的外帶/外送單不再顯示鎖定逾時。購物車底部提供不重疊的「結帳」「出單」「結帳不出單」三個操作，同一張單會沿用原單號。顧客、服務方式、付款與常用備註可在票券上直接修改。飲品品項會先開啟選項面板，必選「飲品溫度」未完成時會在面板與票券行項提示；商品方格與 Cart 品項都可直接輸入數量，也保留正負號調整。商品分類列支援左右滑動快速切換「全部 / 咖啡 / 茶飲 / 輕食 / 零售」等頁面，並可選中分類後用左右箭頭調整分類順序。POS 已加入快速加購跨重啟保留、常用備註 chip、未送出櫃台訂單自動恢復、佇列篩選/搜尋跨重啟保留、現代票券式訂單列、訂單明細展開、訂單左滑露出已完成/已取餐與刪除，櫃台佇列刪除不需管理 PIN，外送/線上訂單按「已取餐」會從目前佇列歸納為已完成；列印單左滑刪除、庫存/低庫存提示、下單原子扣庫存、防搶單平板鎖定、收款確認、未收款訂單作廢、已收款退款沖銷、列印重印紀錄、正式開班/關班、關帳異常檢查與強制確認、鍵盤捷徑（`/` 搜尋、`1`-`6` 加購、`Cmd/Ctrl+Enter` 出單）。
- 影片參考導入：在不改預設色系的前提下，補上 iCHEF 式工具箱、外觀設定卡片、桌況頁進階條件（日期、取餐方式、來源、排序）與常駐供應狀態入口；外觀設定點入後可切換深色模式，並用 -200% 到 +200% 滑桿調整整體介面縮放、畫面密度與文字大小，POS 介面以固定平板 viewport 舞台縮放以避免水平溢出。供應狀態支援搜尋、分類、狀態篩選、批次暫停/恢復、儲存確認與回復上一個動作，並可在工具箱直接新增/刪除分類、商品、註記大項、註記選項與商品註記綁定；儲存時會把分類順序、註記群組、商品綁定與註記停售狀態同步到 `online_ordering` runtime，成功寫入資料庫才視為已儲存，讓線上點餐頁與新平板短輪詢後取得同一套資料。後台營運紀錄會整合平板心跳、開關班與關鍵操作時間線，線上點餐設定可控制接單、預約、平均備餐時間、未確認提醒、接單確認、提示音模式與音量。主佇列第一層已收斂為搜尋、條件與訂單列，訂單列使用短單號、鎖定標籤不外露平板識別，並維持深色模式可讀性；履約預警、任務快篩、SOP 與交班預檢資料模型仍保留，後續適合陸續放入工具箱延伸。
- 消費者線上點餐頁：依後台「線上」通路與 `online_ordering` runtime 設定顯示菜單，支援購物車、取餐/內用/外送、希望時間、外送地址、顧客資料與線上建單；商品會依平板端綁定的註記大項開啟選項面板，必填/最多選幾個與加價會進購物車，註記停售會即時隱藏；頁面每 15 秒同步一次 runtime 與線上商品。暫停接單時保留菜單瀏覽但阻擋加入與送出。
- 前端 POS API 同步：商品、訂單、runtime 設定與收銀班別從 `pos-api` 載入，櫃台草稿單、草稿品項、正式建單與扣庫存、付款狀態、退款沖銷、訂單狀態、訂單 claim lease、列印工作、列印單刪除、平板心跳與開關班寫回 Supabase；claim 只能取得未鎖定、本機持有或已逾時的進行中訂單，避免兩台平板同時處理同一張單。POS 會每 20 秒自動同步訂單佇列、runtime 提醒設定與班別摘要；需要接單確認時，線上/QR 新單先跳出待接單提醒，不混入桌況頁，按「接單」取得 claim 後才排入佇列。線上/QR 待付款新單逾時會自動轉為付款逾期；先建單後編輯的空單/未結帳單會先寫入 Supabase `orders.draft_lines`，所以換平板後仍能追溯草稿單與品項，正式結帳/出單時再由 `finalize_pos_order()` 原子寫入明細並扣庫存；只有 API 失敗時才改存 `script-coffee-pos-pending-orders` 或本機草稿並標示待同步。
- 後台入口：可切換到「後台」管理商品菜單、線上點餐 runtime 設定、庫存數量、低庫存門檻、暫停供應至、POS/線上/掃碼可見性、備餐站、會員錢包與 CSV 匯出、營運日報與 CSV 匯出、金流回呼事件篩選/匯出、出單機與印單規則、角色權限、營運紀錄、平板在線與操作稽核匯出；遠端商品新增/刪除/修改需設定 `POS_ADMIN_PIN`。
- 區網列印 POC：出單機 IP、服務方式、商品分類、貼紙/收據與份數可由後台設定；前台列印站按鈕可送出 EZPL healthcheck label，訂單會依 runtime 規則拆分 EZPL payload 與 `print_jobs`，列印站會顯示列印單清單並支援滑動刪除，Android APK 內的 `LanPrinter` plugin 會逐筆用 TCP socket 送到 GODEX DT2X，瀏覽器版只做預覽與 print job。
- Supabase 後端：獨立專案已綁定，包含 POS schema migration、金流 webhook 冪等事件與 `pos-api` Edge Function；交易型 `SECURITY DEFINER` RPC 只授權 `service_role`，外部請求固定經過 `pos-api`。
- 操作稽核：建單、收款、退款、付款逾期、作廢、訂單狀態、平板鎖定、商品/設定異動、會員建立、錢包調整與開關班會寫入 `pos_audit_events`，商品稽核會標出庫存/售價等欄位的異動前後與差額，後台可依 PIN 讀取最近紀錄追查。
- 工程規範：TypeScript strict、ESLint、禁止 legacy DOM/event bridge 的 guardrails。
- GitHub Actions：guardrails、typecheck、lint、Edge Function check、build，並在 `main` 自動部署 GitHub Pages 與 Supabase。

GitHub 倉庫：<https://github.com/scriptcoffeeshop/pos>，目前為 public。

## 本機開發

```bash
rtk npm install
rtk npm run dev
```

常用檢查：

```bash
rtk npm run guardrails
rtk npm run typecheck
rtk npm run lint
rtk npm run check:backend
rtk npm run build
rtk npm run ci-local
rtk npm run tablet:url
rtk npm run apk:debug
```

本機環境變數請從 `.env.example` 複製成 `.env.local`，不要提交真實金鑰。

## 架構文件

- [系統架構](docs/architecture.md)
- [Supabase 新專案設定](docs/supabase-setup.md)
- [區域網路列印 POC](docs/lan-printing-poc.md)
- [金流 Webhook 契約](docs/payment-webhooks.md)
- [分期計畫](docs/phase-plan.md)
- [部署路線](docs/deployment.md)
- [平板測試流程](docs/tablet-testing.md)
- [Android APK 測試流程](docs/android-apk.md)
- [GitHub Pages 網域設定](docs/custom-domain.md)
- [開發交接](DEV_CONTEXT.md)

## 主要決策

- 前端全面 Vue-owned state，不新增 inline `onclick/onchange`、`data-action` 事件代理、`window.*` 全域 API 或 `innerHTML` 資料渲染。
- 先用 GitHub Pages 承載消費者線上點餐與 Web POS；硬體列印走 Capacitor Android APK 內的 `LanPrinter` TCP socket plugin，直接送 EZPL 到 GODEX DT2X。
- 後端沿用咖啡訂購專案經驗：Supabase PostgreSQL + Deno/Hono Edge Functions，金鑰放 GitHub Secrets 或 Supabase，不進 git。
