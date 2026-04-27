# 部署路線

## GitHub Pages

CI 已預留手動部署 job。第一次部署前：

1. 確認 private repo 是否符合目前 GitHub Pages 方案；若要公開部署，先評估是否改成 public。
2. GitHub repo 設定 Pages source 為 GitHub Actions。
3. 到 Actions 執行 `POS CI` workflow。
4. 勾選 `deploy_frontend=true`。

Vite 會在 GitHub Actions 內偵測 `scriptcoffeeshop/pos`，自動使用 `/pos/` base path。

## Supabase

POS 後端會使用另一個全新的 Supabase 專案，不沿用咖啡訂購專案。建立後需要：

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD`、`SUPABASE_PROJECT_REF` 放 GitHub Secrets 或 `.env.supabase.local`。前端公開值使用 `.env.local` 與部署環境變數管理。

## Android APK

Phase 2 才加入 Capacitor。APK 產物不直接提交 git，建議後續用 GitHub Actions artifact 或 release 管理。
