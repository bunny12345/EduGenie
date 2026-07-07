#!/usr/bin/env bash
set -euo pipefail
# apply_rls.sh - Apply RLS SQL files to a Postgres database using psql
# Usage: DATABASE_URL=postgresql://... ./apply_rls.sh [file1.sql file2.sql ...]

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found in PATH. Install Postgres client tools."
  exit 2
fi

DB_URL=${DATABASE_URL:-}
if [ -z "$DB_URL" ]; then
  echo "Please set DATABASE_URL environment variable (postgres connection string)."
  exit 2
fi

FILES=("${@:-rls_policies.sql}")

DIR=$(cd "$(dirname "$0")" && pwd)

for f in "${FILES[@]}"; do
  FILEPATH="$DIR/$f"
  if [ ! -f "$FILEPATH" ]; then
    echo "SQL file not found: $FILEPATH"
    exit 2
  fi
  echo "Applying $FILEPATH..."
  PGPASSFILE=${PGPASSFILE:-}
  # Use psql to run the SQL as the DB URL owner
  psql "$DB_URL" -f "$FILEPATH"
done

echo "RLS SQL applied successfully."
