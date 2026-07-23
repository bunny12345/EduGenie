#!/usr/bin/env bash
# Apply a SQL file to Supabase via the Session Pooler (IPv4).
#
# Why: this project's direct DB host (db.<ref>.supabase.co) is IPv6-only and not
# routable from some networks, so we use the region pooler over IPv4. The pooler
# username is "postgres.<project-ref>" and the password is the URL-DECODED value
# from DATABASE_URL (Supabase percent-encodes it in the connection string).
#
# Usage: apply_sql_pooler.sh <path-to-sql-file>
# Env overrides: POOLER_REGION (default eu-central-1), POOLER_PORT (default 5432)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/../.env"
SQL_FILE="${1:-}"
REGION="${POOLER_REGION:-eu-central-1}"
PORT="${POOLER_PORT:-5432}"

if [ -z "$SQL_FILE" ] || [ ! -f "$SQL_FILE" ]; then
  echo "Usage: apply_sql_pooler.sh <path-to-sql-file>"
  exit 2
fi

DBURL=$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | tr -d '\r\n')
if [ -z "$DBURL" ]; then echo "DATABASE_URL not found in $ENV_FILE"; exit 1; fi

# Derive project ref from SUPABASE_URL (https://<ref>.supabase.co).
SUPA_URL=$(sed -n 's/^SUPABASE_URL=//p' "$ENV_FILE" | tr -d '\r\n')
ref=$(printf '%s' "$SUPA_URL" | sed -E 's#https?://([^.]+)\.supabase\.co.*#\1#')

# Extract + URL-decode the password from DATABASE_URL.
proto_removed=${DBURL#*://}
creds=${proto_removed%@*}
pass_enc=${creds#*:}
pass=$(python3 -c "import urllib.parse,sys; print(urllib.parse.unquote(sys.argv[1]))" "$pass_enc")

host="aws-0-$REGION.pooler.supabase.com"
echo "Applying $(basename "$SQL_FILE") via $host (user=postgres.$ref db=postgres)"
export PGPASSWORD="$pass"
psql "host=$host port=$PORT user=postgres.$ref dbname=postgres sslmode=require connect_timeout=10" \
  -v ON_ERROR_STOP=1 -f "$SQL_FILE"
