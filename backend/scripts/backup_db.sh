#!/usr/bin/env bash
set -euo pipefail
# Backup the Postgres database referenced by DATABASE_URL using pg_dump
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
export DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env | tr -d '\r\n')
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL not set in .env" >&2
  exit 1
fi

OUT_DIR="$DIR/backups"
mkdir -p "$OUT_DIR"
TS=$(date -u +"%Y%m%dT%H%M%SZ")
OUT_FILE="$OUT_DIR/edugenie_backup_${TS}.sql.gz"

if command -v pg_dump >/dev/null 2>&1; then
  echo "Running pg_dump..."
  # Use PGPASSWORD-less connection via DATABASE_URL
  pg_dump "$DATABASE_URL" | gzip > "$OUT_FILE"
  echo "Backup written to $OUT_FILE"
  exit 0
else
  echo "pg_dump not found on PATH. Install Postgres client tools or run a backup from Supabase dashboard." >&2
  exit 2
fi
