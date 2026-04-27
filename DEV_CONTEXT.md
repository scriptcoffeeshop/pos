# 開發交接紀錄

更新日期：2026-04-28

## 目前狀態

- 專案位置：`/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/POS`
- 技術基底：Vue 3 + Vite + TypeScript。
- 初始畫面：門市 POS 工作台，包含菜單、購物車、付款、訂單佇列與列印站狀態。
- 前端資料流：`src/lib/posApi.ts` 是唯一 POS API client，負責把 Supabase Edge Function snake_case 回應轉成 Vue view model；`usePosSession()` 只處理畫面狀態與 fallback。
- 品牌素材：`public/assets/script-coffee-logo.png` 來自本機 `SC/logo.png`。
- GitHub repo：`scriptcoffeeshop/pos`，目前為 public。
- Git remote：`git@github-scriptcoffeeshop:scriptcoffeeshop/pos.git`。
- SSH 綁定：repo-local `core.sshCommand=ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes`。
- 第一次 CI：GitHub Actions run `25003328938`，`verify` job 已通過；Pages deploy job 只在手動部署時啟動。
- 後端決策：POS 使用獨立 Supabase 專案 `uuzwcmceotooocyrtnao`，不沿用咖啡訂購專案的資料庫。
- 本機 env：`.env.local` 與 `.env.supabase.local` 已建立並被 `.gitignore` 保護，不提交真實值。
- GitHub Secrets / Variables：已設定 Supabase deploy 需要的 secrets 與前端 build variables。
- 遠端部署：`20260427155000_initial_pos_schema.sql` 已推到 Supabase；`pos-api` Edge Function 已部署並通過 `/health`、`/products` 驗證。
- POS API 同步：商品與訂單會從 `/products`、`/orders` 載入，櫃台建單走 `POST /orders`，訂單狀態走 `PATCH /orders/:id/status`，列印工作走 `POST /print-jobs`。

## 來源藍圖

參考文件：`/Users/kimi/Downloads/POS 系統藍圖更新：區域網路列印版.pdf`

藍圖重點：

- Samsung Tab A11+ 作為前台 POS 平板。
- GODEX DT2X 透過 RJ45 接店內 AP，固定內網 IP，例如 `192.168.1.100`。
- Web POS 使用 Vue 3 + Vite SFC，原始網頁部署到 GitHub Pages。
- Android 平板版本使用 Capacitor 封裝成 APK。
- 區網列印用 Capacitor TCP socket 外掛繞過瀏覽器對本地 IP 的限制，直接送 EZPL 到出單機。
- 後端採 Supabase PostgreSQL + Deno/Hono Edge Functions。
- 外部整合包含 LINE Login、LINE Pay、街口支付。

## 沿用咖啡訂購專案的經驗

- 文件要分層：`README.md` 放人類可操作的入口，`DEV_CONTEXT.md` 放交接脈絡，長期規劃放 `docs/`。
- CI 要阻擋容易回到 legacy 的前端模式，所以這裡加入 `scripts/check_frontend_guardrails.py`。
- 表單與付款狀態要在使用者互動邊界就清楚建模，不只靠後端拒絕。
- 未來接 Supabase 時，資料流要從 API 回應、共享 types、view model 到 Vue template 一次打通。
- 金鑰與部署憑證只放 `.env.local`、GitHub Secrets 或 Supabase Secrets。

## 下一步

1. GitHub Pages 部署確認後，將 Web POS 固定到公開 URL。
2. Phase 2 安裝 Capacitor 與 TCP socket 外掛，做 GODEX DT2X 實機列印 POC。
3. 接 LINE Login / LINE Pay / 街口支付前，先補對應 webhook 與付款逾期狀態測試。
4. 規劃 APK build 與店內平板安裝流程。
