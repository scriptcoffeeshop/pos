# 部署路線

## GitHub Pages

CI 已預留手動部署 job。倉庫目前已改為 public，可使用 GitHub Free 的 GitHub Pages。第一次部署前：

1. GitHub repo 設定 Pages source 為 GitHub Actions。
2. 到 Actions 執行 `POS CI` workflow。
3. 勾選 `deploy_frontend=true`。

Vite 會在 GitHub Actions 內偵測 `scriptcoffeeshop/pos`，自動使用 `/pos/` base path。

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

Phase 2 才加入 Capacitor。APK 產物不直接提交 git，建議後續用 GitHub Actions artifact 或 release 管理。
