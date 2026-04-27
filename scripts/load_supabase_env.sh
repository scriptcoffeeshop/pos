#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT_DIR/.env.supabase.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.supabase.local"
  set +a
fi

missing=()
for name in SUPABASE_PROJECT_REF SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD; do
  if [ -z "${!name:-}" ]; then
    missing+=("$name")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'Missing Supabase environment values: %s\n' "${missing[*]}" >&2
  exit 1
fi
