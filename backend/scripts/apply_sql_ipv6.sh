#!/usr/bin/env bash
# Apply a SQL file to Supabase over IPv6 (direct host has AAAA only; psql's
# resolver won't fall back to AAAA when the A record is NODATA, so we pass the
# resolved IPv6 via hostaddr while keeping the hostname for TLS SNI).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/../.env"
SQL_FILE="${1:-}"

if [ -z "$SQL_FILE" ]; then
  echo "Usage: apply_sql_ipv6.sh <path-to-sql-file>"
  exit 2
fi

DBURL=$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | tr -d '\r\n')
if [ -z "$DBURL" ]; then
  echo "DATABASE_URL not found in $ENV_FILE"
  exit 1
fi

proto_removed=${DBURL#*://}
creds=${proto_removed%@*}
hostpart=${proto_removed#*@}
user=${creds%%:*}
pass=${creds#*:}
hostport=${hostpart%%/*}
dbrest=${hostpart#*/}
dbname=${dbrest%%\?*}
host=${hostport%%:*}
port=${hostport#*:}
[ "$port" = "$host" ] && port=5432

ip6=$(dig +short AAAA "$host" | head -1)
if [ -z "$ip6" ]; then
  echo "Could not resolve AAAA for $host"
  exit 1
fi

echo "Connecting user=$user host=$host ip6=$ip6 port=$port db=$dbname"
export PGPASSWORD="$pass"
psql "host=$host hostaddr=$ip6 port=$port user=$user dbname=$dbname sslmode=require" \
  -v ON_ERROR_STOP=1 -f "$SQL_FILE"
