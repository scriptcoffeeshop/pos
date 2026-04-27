# 部署路線

## GitHub Pages

CI 已預留手動部署 job。第一次部署前：

1. GitHub repo 設定 Pages source 為 GitHub Actions。
2. 到 Actions 執行 `POS CI` workflow。
3. 勾選 `deploy_frontend=true`。

Vite 會在 GitHub Actions 內偵測 `scriptcoffeeshop/pos`，自動使用 `/pos/` base path。

## Supabase

尚未建立 POS 專用 Supabase 專案。建立後需要：

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

前兩者放 GitHub Secrets，前端公開 anon key 使用 `.env.local` 與部署環境變數管理。

## Android APK

Phase 2 才加入 Capacitor。APK 產物不直接提交 git，建議後續用 GitHub Actions artifact 或 release 管理。
