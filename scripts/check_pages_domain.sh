#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-scriptcoffeeshop/pos}"
DOMAIN="${PAGES_DOMAIN:-order.scriptcoffee.com.tw}"
ENABLE_HTTPS="false"

if [[ "${1:-}" == "--enable-https" ]]; then
  ENABLE_HTTPS="true"
fi

echo "GitHub Pages domain check"
echo "repo:   ${REPO}"
echo "domain: ${DOMAIN}"
echo

echo "DNS"
for resolver in default 1.1.1.1 8.8.8.8 cns1.net-chinese.com.tw cns2.net-chinese.com.tw; do
  if [[ "${resolver}" == "default" ]]; then
    cname="$(dig +short "${DOMAIN}" CNAME || true)"
    address="$(dig +short "${DOMAIN}" A || true)"
  else
    cname="$(dig @"${resolver}" +short "${DOMAIN}" CNAME || true)"
    address="$(dig @"${resolver}" +short "${DOMAIN}" A || true)"
  fi
  echo "${resolver} CNAME: ${cname:-<empty>}"
  echo "${resolver} A:     ${address:-<empty>}"
done
echo

echo "HTTP"
http_status="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "http://${DOMAIN}/" 2>/dev/null || true)"
https_status="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "https://${DOMAIN}/" 2>/dev/null || true)"
https_insecure_status="$(curl -k -sS -o /dev/null -w "%{http_code}" --max-time 20 "https://${DOMAIN}/" 2>/dev/null || true)"
echo "http status:           ${http_status:-unreachable}"
echo "https status:          ${https_status:-unreachable}"
echo "https status (-k):     ${https_insecure_status:-unreachable}"
echo

echo "GitHub Pages"
gh api "repos/${REPO}/pages" --jq '{
  cname,
  status,
  html_url,
  https_enforced,
  pending_domain_unverified_at,
  protected_domain_state,
  https_certificate
}'
echo

echo "GitHub Pages DNS health"
gh api "repos/${REPO}/pages/health" --jq '.domain // .'
echo

if [[ "${ENABLE_HTTPS}" == "true" ]]; then
  echo "Trying to enable Enforce HTTPS..."
  gh api \
    --method PUT \
    "/repos/${REPO}/pages" \
    -H "X-GitHub-Api-Version: 2026-03-10" \
    -f "cname=${DOMAIN}" \
    -F "https_enforced=true" \
    -f "build_type=workflow"
  echo "Enforce HTTPS request accepted."
else
  echo "Tip: run with --enable-https after GitHub reports a valid certificate."
fi
