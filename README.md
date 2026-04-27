# Script Coffee POS

Script Coffee POS 是門市平板點餐、線上訂單中樞與 GODEX DT2X 區域網路列印的初始專案。第一版已建立 Vue 3 + Vite + TypeScript 前端工作台，並接上獨立 Supabase `pos-api` 作為商品、訂單與列印工作的後端入口；後續再接 LINE Login、LINE Pay / 街口支付與 Capacitor Android APK。

## 初版範圍

- 門市 POS 第一屏：品項、購物車、付款方式、顧客備註、訂單佇列。
- 前端 POS API 同步：商品與訂單從 `pos-api` 載入，櫃台建單、狀態更新與列印工作寫回 Supabase；API 失敗時保留本機 fallback。
- 後台入口：可切換到「後台」管理商品菜單、POS/線上/掃碼可見性、備餐站、出單機與印單規則、角色權限；遠端儲存需設定 `POS_ADMIN_PIN`。
- 區網列印 POC 介面：出單機 IP 可由後台設定，前台會讀取 runtime 設定產生 EZPL 預覽與列印工作。
- Supabase 後端：獨立專案已綁定，包含 POS schema migration 與 `pos-api` Edge Function。
- 工程規範：TypeScript strict、ESLint、禁止 legacy DOM/event bridge 的 guardrails。
- GitHub Actions：guardrails、typecheck、lint、Edge Function check、build，並在 `main` 自動部署 Supabase。

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
```

本機環境變數請從 `.env.example` 複製成 `.env.local`，不要提交真實金鑰。

## 架構文件

- [系統架構](docs/architecture.md)
- [Supabase 新專案設定](docs/supabase-setup.md)
- [區域網路列印 POC](docs/lan-printing-poc.md)
- [分期計畫](docs/phase-plan.md)
- [部署路線](docs/deployment.md)
- [平板測試流程](docs/tablet-testing.md)
- [開發交接](DEV_CONTEXT.md)

## 主要決策

- 前端全面 Vue-owned state，不新增 inline `onclick/onchange`、`data-action` 事件代理、`window.*` 全域 API 或 `innerHTML` 資料渲染。
- 先用 GitHub Pages 承載 Web POS，再於 Phase 2 用 Capacitor 封裝 Android APK，透過 TCP socket 直接送 EZPL 到 GODEX DT2X。
- 後端沿用咖啡訂購專案經驗：Supabase PostgreSQL + Deno/Hono Edge Functions，金鑰放 GitHub Secrets 或 Supabase，不進 git。
