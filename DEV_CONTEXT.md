# 開發交接紀錄

更新日期：2026-04-28

## 目前狀態

- 專案位置：`/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/POS`
- 技術基底：Vue 3 + Vite + TypeScript。
- 初始畫面：門市 POS 工作台，包含菜單、購物車、付款、訂單佇列與列印站狀態；`order.scriptcoffee.com.tw` 會預設進入消費者線上點餐頁。
- 前端資料流：`src/lib/posApi.ts` 是唯一 POS API client，負責把 Supabase Edge Function snake_case 回應轉成 Vue view model；`usePosSession()` 只處理畫面狀態與 fallback。
- 後台入口：`src/components/AdminPanel.vue` 管理商品菜單、POS/線上/掃碼可見性、備餐站、出單機規則與角色權限；寫入需 Supabase secret `POS_ADMIN_PIN`。
- 品牌素材：`public/assets/script-coffee-logo.png` 來自本機 `SC/logo.png`。
- GitHub repo：`scriptcoffeeshop/pos`，目前為 public。
- Git remote：`git@github-scriptcoffeeshop:scriptcoffeeshop/pos.git`。
- SSH 綁定：repo-local `core.sshCommand=ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes`。
- 第一次 CI：GitHub Actions run `25003328938`，`verify` job 已通過；Pages deploy job 後續已改為 `main` push 自動部署。
- 後端決策：POS 使用獨立 Supabase 專案 `uuzwcmceotooocyrtnao`，不沿用咖啡訂購專案的資料庫。
- 本機 env：`.env.local` 與 `.env.supabase.local` 已建立並被 `.gitignore` 保護，不提交真實值。
- GitHub Secrets / Variables：已設定 Supabase deploy 需要的 secrets 與前端 build variables。
- Pages 網域：網路中文已設定 `order.scriptcoffee.com.tw` CNAME 到 `scriptcoffeeshop.github.io.`，公開 DNS 已解析，GitHub Pages custom domain 已綁定；GitHub 憑證尚未核發時 `https_certificate=null`，需稍後執行 `rtk npm run pages:enable-https`。
- 遠端部署：`20260427155000_initial_pos_schema.sql` 已推到 Supabase；`pos-api` Edge Function 已部署並通過 `/health`、`/products` 驗證。
- POS API 同步：商品、訂單與 runtime 出單機設定會從 `/products?channel=pos`、`/orders`、`/settings/runtime` 載入；消費者線上菜單讀 `/products?channel=online`；櫃台與線上建單都走 `POST /orders`，訂單狀態走 `PATCH /orders/:id/status`，列印工作走 `POST /print-jobs`。
- 平板測試：`rtk npm run tablet:url` 會輸出同 Wi-Fi 平板可開啟的本機網址；瀏覽器版不能直連 TCP 出單機。
- APK 測試：已加入 Capacitor Android 專案、`Android APK` workflow 與 Android `LanPrinter` TCP socket plugin；本機若未安裝 Node.js 22+、JDK / Android SDK，可先用 GitHub Actions artifact 下載 debug APK。

## 來源藍圖

參考文件：`/Users/kimi/Downloads/POS 系統藍圖更新：區域網路列印版.pdf`

藍圖重點：

- Samsung Tab A11+ 作為前台 POS 平板。
- GODEX DT2X 透過 RJ45 接店內 AP，固定內網 IP，例如 `192.168.1.100`。
- Web POS 使用 Vue 3 + Vite SFC，原始網頁部署到 GitHub Pages。
- Android 平板版本使用 Capacitor 封裝成 APK，debug APK 測試流程見 `docs/android-apk.md`。
- 區網列印用 Android `LanPrinter` Capacitor native plugin 繞過瀏覽器對本地 IP 的限制，直接送 EZPL 到出單機。
- 後端採 Supabase PostgreSQL + Deno/Hono Edge Functions。
- 外部整合包含 LINE Login、LINE Pay、街口支付。

## 沿用咖啡訂購專案的經驗

- 文件要分層：`README.md` 放人類可操作的入口，`DEV_CONTEXT.md` 放交接脈絡，長期規劃放 `docs/`。
- CI 要阻擋容易回到 legacy 的前端模式，所以這裡加入 `scripts/check_frontend_guardrails.py`。
- 表單與付款狀態要在使用者互動邊界就清楚建模，不只靠後端拒絕。
- 未來接 Supabase 時，資料流要從 API 回應、共享 types、view model 到 Vue template 一次打通。
- 金鑰與部署憑證只放 `.env.local`、GitHub Secrets 或 Supabase Secrets。

## 下一步

1. 等 GitHub Pages `https_certificate` 產生後，執行 `rtk npm run pages:enable-https` 開啟強制 HTTPS。
2. 在 Samsung Tab A11+ 安裝最新版 debug APK，對 GODEX DT2X 做 healthcheck label 與櫃台訂單列印實測。
3. 接 LINE Login / LINE Pay / 街口支付前，先補對應 webhook 與付款逾期狀態測試。
4. 依實機列印結果調整 EZPL 版面、中文顯示與多平板重複出單鎖定策略。
