#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-5173}"
IP_ADDRESS=""

for iface in en0 en1; do
  if IP_ADDRESS="$(ipconfig getifaddr "$iface" 2>/dev/null)" && [ -n "$IP_ADDRESS" ]; then
    break
  fi
done

if [ -z "$IP_ADDRESS" ]; then
  IP_ADDRESS="$(ifconfig | awk '/inet / && $2 !~ /^127\\./ { print $2; exit }')"
fi

if [ -z "$IP_ADDRESS" ]; then
  echo "找不到本機區網 IP。請確認 Mac 已連上與平板相同的 Wi-Fi。"
  exit 1
fi

echo "平板測試網址：http://${IP_ADDRESS}:${PORT}/"
echo "開發伺服器：rtk npm run dev"
