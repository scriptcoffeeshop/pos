# Script Coffee POS

Script Coffee POS 是門市平板點餐、線上訂單中樞與 GODEX DT2X 區域網路列印的初始專案。第一版已建立 Vue 3 + Vite + TypeScript 前端工作台，並接上獨立 Supabase `pos-api` 作為商品、訂單與列印工作的後端入口；後續再接 LINE Login、LINE Pay / 街口支付與 Capacitor Android APK。

## 初版範圍

- 門市 POS 第一屏：工作站已改為接近 iCHEF 操作心智的淺色觸控工作台，左側固定主導航切換「點餐、資訊、付款、訂單、列印、班別」，點餐頁以「分類欄、商品大按鈕矩陣、右側票券/結帳」三欄呈現；顧客、服務方式、付款與常用備註可在票券上直接修改，商品方格與 Cart 品項都可直接輸入數量，也保留正負號調整。POS 已加入快速加購跨重啟保留、常用備註 chip、未送出櫃台草稿自動恢復、佇列篩選/付款篩選/搜尋跨重啟保留、訂單明細展開、訂單左滑作廢/退款，無法處理時會顯示已退款、已交付、付款逾期或先接手等原因、列印單左滑刪除、庫存/低庫存提示、下單原子扣庫存、防搶單平板鎖定、收款確認、未收款訂單作廢、已收款退款沖銷、列印重印紀錄、正式開班/關班、關帳異常檢查與強制確認、鍵盤捷徑（`/` 搜尋、`1`-`6` 加購、`Cmd/Ctrl+Enter` 建單）。
- 消費者線上點餐頁：依後台「線上」通路顯示菜單，支援購物車、取餐/內用/外送、希望時間、外送地址、顧客資料與線上建單。
- 前端 POS API 同步：商品、訂單、runtime 設定與收銀班別從 `pos-api` 載入，櫃台建單與扣庫存、付款狀態、退款沖銷、訂單狀態、訂單 claim lease、列印工作、列印單刪除、平板心跳與開關班寫回 Supabase；claim 只能取得未鎖定、本機持有或已逾時的進行中訂單，避免兩台平板同時處理同一張單。POS 會每 20 秒自動同步訂單佇列與班別摘要，線上/QR 待付款新單逾時會自動轉為付款逾期，API 失敗時保留並標示本機待同步訂單，API 恢復後補同步。
- 後台入口：可切換到「後台」管理商品菜單、庫存數量、低庫存門檻、暫停供應至、POS/線上/掃碼可見性、備餐站、會員錢包與 CSV 匯出、營運日報與 CSV 匯出、金流回呼事件篩選/匯出、出單機與印單規則、角色權限、平板在線與操作稽核匯出；遠端讀寫需設定 `POS_ADMIN_PIN`。
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
