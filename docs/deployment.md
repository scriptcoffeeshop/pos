# 部署路線

## GitHub Pages

CI 會在 `main` push 後自動部署 GitHub Pages。倉庫目前已改為 public，可使用 GitHub Free 的 GitHub Pages。第一次部署前：

1. GitHub repo 設定 Pages source 為 GitHub Actions。
2. 到 Actions 執行 `POS CI` workflow。
3. 若要手動補部署，勾選 `deploy_frontend=true`。

Vite 使用相對 base path，讓 GitHub Pages 預設網址與 custom domain 都能讀取同一份靜態資產。

消費者線上點餐建議綁定 `order.scriptcoffee.com.tw`。DNS 與 GitHub Pages custom domain 設定見 [GitHub Pages 網域設定](custom-domain.md)。

檢查目前 Pages / DNS / HTTPS 狀態：

```bash
rtk npm run pages:check
```

GitHub Pages 憑證核發後啟用強制 HTTPS：

```bash
rtk npm run pages:enable-https
```

## Supabase

POS 後端會使用另一個全新的 Supabase 專案，不沿用咖啡訂購專案。建立後需要：

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD`、`SUPABASE_PROJECT_REF` 放 GitHub Secrets 或 `.env.supabase.local`。前端公開值使用 `.env.local` 與部署環境變數管理。

目前已綁定 project ref：`uuzwcmceotooocyrtnao`。

部署命令：

```bash
rtk npm run supabase:db:push
rtk npm run supabase:functions:deploy
```

`main` 分支的 GitHub Actions 會在 verify 通過後自動執行 Supabase migration 與 `pos-api` Edge Function deploy。

## Android APK

已加入 Capacitor Android 專案與 `Android APK` GitHub Actions workflow。Debug APK 產物不直接提交 git，使用 Actions artifact 管理。

手動產出測試 APK：

```bash
rtk npm run apk:debug
```

目前本機若尚未安裝 Node.js 22+、JDK / Android SDK，請改用 GitHub Actions 產出 APK。安裝平板流程見 [Android APK 測試流程](android-apk.md)。
