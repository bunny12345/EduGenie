#!/usr/bin/env bash
set -euo pipefail
# Simple wrapper to call the local prune endpoint using env from .env
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
# load env vars from .env (non-interactive)
export SUPABASE_SERVICE_ROLE_KEY=$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' .env | tr -d '\r\n')
export DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env | tr -d '\r\n')

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "SUPABASE_SERVICE_ROLE_KEY not set in .env" >&2
  exit 1
fi

# Call prune endpoint and save output
TMP_OUT="/tmp/edugenie_prune_last.json"
HTTP_STATUS=$(curl -s -w "%{http_code}" -o "$TMP_OUT" -X POST "http://localhost:3000/chat/prune_memories" -H "x-service-role-key: $SUPABASE_SERVICE_ROLE_KEY")

echo "Prune HTTP status: $HTTP_STATUS"
if [ -f "$TMP_OUT" ]; then
  echo "Response saved to $TMP_OUT"
  cat "$TMP_OUT"
fi

# exit with non-zero if HTTP not 2xx
if [ "$HTTP_STATUS" -lt 200 ] || [ "$HTTP_STATUS" -ge 300 ]; then
  exit 2
fi
