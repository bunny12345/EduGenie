#!/usr/bin/env bash
set -euo pipefail
# Run the embeddings vector migration using psql and DATABASE_URL from .env
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
export DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env | tr -d '\r\n')
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL not set in .env" >&2
  exit 1
fi

MIGRATION_FILE="$DIR/db/migrations/2026-07-06-embeddings-vector.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "Migration file not found: $MIGRATION_FILE" >&2
  exit 2
fi

echo "Running migration: $MIGRATION_FILE"
psql "$DATABASE_URL" -f "$MIGRATION_FILE"

echo "Migration complete."
