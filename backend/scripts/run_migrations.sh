#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$HERE/../db"
INIT_SQL="$DB_DIR/init.sql"
MIGRATIONS_DIR="$DB_DIR/migrations"
ENV_FILE="$HERE/../.env"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  export DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | tr -d '\r\n')
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Please set DATABASE_URL to your Postgres connection string."
  echo "Example: export DATABASE_URL=postgres://user:pass@host:5432/dbname"
  exit 1
fi

run_sql() {
  local sql_file="$1"
  echo "Applying $(basename "$sql_file")"
  psql "$DATABASE_URL" -f "$sql_file"
}

run_sql "$INIT_SQL"

if [ -d "$MIGRATIONS_DIR" ]; then
  shopt -s nullglob
  migration_files=("$MIGRATIONS_DIR"/*.sql)
  shopt -u nullglob

  if [ ${#migration_files[@]} -gt 0 ]; then
    IFS=$'\n' migration_files=($(printf '%s\n' "${migration_files[@]}" | sort))
    unset IFS
    for sql_file in "${migration_files[@]}"; do
      run_sql "$sql_file"
    done
  fi
fi

echo "All migrations applied."
