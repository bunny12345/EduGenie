#!/usr/bin/env bash
set -euo pipefail
# Backup tables via Supabase REST API using the service role key (no direct DB TCP required)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

export SUPABASE_URL=$(sed -n 's/^SUPABASE_URL=//p' .env | tr -d '\r\n')
export SUPABASE_SERVICE_ROLE_KEY=$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' .env | tr -d '\r\n')

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env" >&2
  exit 1
fi

OUT_DIR="$DIR/backups/rest_$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"

# Tables to export (add or remove as needed)
tables=(students messages memories homework)

for t in "${tables[@]}"; do
  echo "Exporting $t..."
  # Use the PostgREST REST endpoint
  url="$SUPABASE_URL/rest/v1/$t?select=*"
  /usr/bin/env curl -sSf -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Accept: application/json" "$url" -o "$OUT_DIR/$t.json"
  gzip -f "$OUT_DIR/$t.json"
done

echo "REST backup complete: $OUT_DIR"
ls -lh "$OUT_DIR"

exit 0
