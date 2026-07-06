#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$HERE/../db/init.sql"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Please set DATABASE_URL to your Postgres connection string."
  echo "Example: export DATABASE_URL=postgres://user:pass@host:5432/dbname"
  exit 1
fi

psql "$DATABASE_URL" -f "$SQL"

echo "Migrations applied."
