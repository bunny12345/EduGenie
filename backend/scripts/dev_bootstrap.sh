#!/usr/bin/env bash
set -euo pipefail
# dev_bootstrap.sh <studentId>
# Generates a dev JWT, prints it, exports it, and starts the backend (mock LLM + server).

STUDENT_ID=${1:-dev-student-1}
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  # load env vars from backend/.env into this shell
  # only lines with KEY=VALUE (ignore comments)
  # shellcheck disable=SC1090
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

if [ -z "${SUPABASE_JWT_SECRET:-}" ]; then
  echo "ERROR: SUPABASE_JWT_SECRET not set in $ENV_FILE or environment"
  exit 2
fi

echo "Using SUPABASE_JWT_SECRET from $ENV_FILE"

TOKEN=$(node "$ROOT_DIR/scripts/make_dev_token.js" "$STUDENT_ID")
echo
echo "=== Dev token for student $STUDENT_ID ==="
echo "$TOKEN"
echo "========================================"
echo

export SUPABASE_JWT_SECRET
export TOKEN

echo "Starting backend (mock LLM + server). Press Ctrl+C to stop."
cd "$ROOT_DIR" || exit 1
npm run dev --prefix .
