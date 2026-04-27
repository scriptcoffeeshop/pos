#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/load_supabase_env.sh"

supabase functions deploy pos-api --project-ref "$SUPABASE_PROJECT_REF" --use-api
