# GitHub Pages 網域設定

## 建議網域

消費者線上點餐頁面使用：

```text
order.scriptcoffee.com.tw
```

這是 `scriptcoffee.com.tw` 底下的子網域，適合獨立綁定到此 GitHub Pages 專案。若要使用 `scriptcoffee.com.tw/order` 這種路徑，需要主網域本身由可設定 reverse proxy / rewrite 的服務管理；純 GitHub Pages 不能只接管既有主網域底下的一段路徑。

## GitHub 設定

1. 到 `scriptcoffeeshop/pos` repo。
2. 進入 `Settings` -> `Pages`。
3. `Custom domain` 輸入：

```text
order.scriptcoffee.com.tw
```

4. 儲存後等待 GitHub 檢查 DNS。
5. HTTPS 可用後開啟 `Enforce HTTPS`。

目前狀態：

- GitHub Pages custom domain 已綁定 `order.scriptcoffee.com.tw`。
- 網路中文後台已設定 `order.scriptcoffee.com.tw` CNAME 到 `scriptcoffeeshop.github.io.`。
- 2026-04-28 使用者回報 HTTPS 已完成。
- Codex 沙盒目前無法直接二次驗證此狀態：`dig` 會因 socket 權限失敗，GitHub API 也會被網路限制擋住；需要用一般終端、GitHub Pages UI 或 GitHub Actions 檢查。

專案已在 `public/CNAME` 保留同一個網域，讓部署產物可追蹤目前目標；但此 repo 使用 GitHub Actions 發布 Pages，仍需要在 GitHub Pages 設定中指定 custom domain。

GitHub 官方文件：<https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>

## DNS 設定

在 `scriptcoffee.com.tw` 的 DNS 管理後台新增一筆：

| Type | Name | Value |
| --- | --- | --- |
| `CNAME` | `order` | `scriptcoffeeshop.github.io` |

重點：

- CNAME value 不要包含 repo 名稱，不是 `scriptcoffeeshop.github.io/pos`。
- 不要使用 `*.scriptcoffee.com.tw` wildcard 指到 GitHub Pages。
- DNS 生效可能需要數分鐘到 24 小時。

檢查指令：

```bash
dig order.scriptcoffee.com.tw +nostats +nocomments +nocmd
dig @cns1.net-chinese.com.tw order.scriptcoffee.com.tw CNAME +short
dig @cns2.net-chinese.com.tw order.scriptcoffee.com.tw CNAME +short
rtk npm run pages:check
```

結果應看到 `order.scriptcoffee.com.tw` CNAME 到 `scriptcoffeeshop.github.io`，再由 GitHub Pages 回應。
若 `cns1` 有回應但 `cns2` 沒有，GitHub Pages 仍可能判定 DNS 未設定成功，因為任一權威 DNS 都可能被查到。

若未來重新綁定網域，且 `pages:check` 顯示 GitHub Pages 已有有效 `https_certificate` 後，可執行：

```bash
rtk npm run pages:enable-https
```

## 若要使用主網域

若未來要讓 `scriptcoffee.com.tw` 本身也指到 GitHub Pages，DNS 需要在 apex/root domain 加上 GitHub Pages 的 `A` records：

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

也可另外加 `AAAA` records 支援 IPv6。主網域若已用在其他網站，先不要設定這組 root records，避免影響既有網站。
