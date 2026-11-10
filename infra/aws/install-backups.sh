#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="${ACADEMIX_SSH_KEY:-$HOME/.ssh/academix/academix-backend.pem}"
INSTANCE="$(terraform -chdir="$DIR" output -raw backend_instance_id)"
BUCKET="$(terraform -chdir="$DIR" output -raw database_backup_bucket)"
REGION="${AWS_REGION:-ap-south-1}"
IP="$(aws ec2 describe-instances --instance-ids "$INSTANCE" --region "$REGION" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "ec2-user@$IP")

umask 077
CONNECTION="$(mktemp)"
CERTIFICATE="$(mktemp)"
trap 'rm -f "$CONNECTION" "$CERTIFICATE"' EXIT
curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
  https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt \
  -o "$CERTIFICATE"
FINGERPRINT="$(openssl x509 -in "$CERTIFICATE" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':' | tr '[:upper:]' '[:lower:]')"
if [[ "$FINGERPRINT" != "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa" ]]; then
  echo "Unexpected Supabase CA fingerprint; review the certificate before updating the pin" >&2
  exit 1
fi
python3 - "$DIR/../../backend/scripts" "${1:-}" > "$CONNECTION" <<'PY'
import os
from pathlib import Path
import re
import sys
from urllib.parse import quote, unquote, urlsplit, urlunsplit
sys.path.insert(0, sys.argv[1])
from backup_db import connection_environment, connection_urls, ROOT
file = ROOT / ".env"
settings = connection_urls(file)
url = os.environ.get("BACKUP_DATABASE_URL") or settings.get("BACKUP_DATABASE_URL")
if sys.argv[2]:
    host = sys.argv[2]
    if not re.fullmatch(r"aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com", host):
        raise SystemExit("Pass only the Session pooler hostname from your Supabase Connect dialog")
    direct = urlsplit(os.environ.get("DATABASE_URL") or settings.get("DATABASE_URL") or "")
    project = re.fullmatch(r"db\.([a-z0-9]+)\.supabase\.co", direct.hostname or "")
    if not project or not direct.username or not direct.password:
        raise SystemExit("Existing DATABASE_URL must contain this project's direct database connection")
    user = quote(unquote(direct.username) + "." + project[1], safe=".")
    password = quote(unquote(direct.password), safe="")
    url = urlunsplit(("postgresql", f"{user}:{password}@{host}:5432", direct.path, "sslmode=verify-full", ""))
if not url:
    raise SystemExit("Set BACKUP_DATABASE_URL privately in backend/.env before installing the database timer")
os.environ["BACKUP_DATABASE_URL"] = url
connection_environment(file)
print("BACKUP_DATABASE_URL=" + url)
PY
"${SSH[@]}" 'sudo sh -c "umask 077; cat > /etc/academix-backup.env"' < "$CONNECTION"

"${SSH[@]}" 'mkdir -p ~/academix-backup-install && chmod 700 ~/academix-backup-install'
scp -i "$KEY" "$DIR/../../backend/scripts/backup_db.py" \
  "$DIR/files/database-backup.sh" "$DIR/files/academix-database-backup.service" \
  "$DIR/files/academix-database-backup.timer" "ec2-user@$IP:academix-backup-install/"
scp -i "$KEY" "$CERTIFICATE" "ec2-user@$IP:academix-backup-install/supabase-ca.crt"
"${SSH[@]}" "sudo install -d -m 700 /opt/academix-backup /var/lib/academix-backups
  sudo install -m 600 ~/academix-backup-install/backup_db.py /opt/academix-backup/
  sudo install -m 700 ~/academix-backup-install/database-backup.sh /opt/academix-backup/
  sudo install -m 600 ~/academix-backup-install/supabase-ca.crt /opt/academix-backup/
  sudo install -m 644 ~/academix-backup-install/academix-database-backup.service /etc/systemd/system/
  sudo install -m 644 ~/academix-backup-install/academix-database-backup.timer /etc/systemd/system/
  printf '%s\n' 'AWS_REGION=$REGION' 'BACKUP_BUCKET=$BUCKET' 'BACKUP_ENV_FILE=/etc/academix-backup.env' | sudo tee /etc/academix-backup.conf >/dev/null
  sudo chmod 600 /etc/academix-backup.conf
  sudo docker pull postgres:18-alpine
  sudo systemctl daemon-reload
  sudo systemctl enable --now academix-database-backup.timer
  sudo systemctl list-timers academix-database-backup.timer --no-pager
  rm ~/academix-backup-install/backup_db.py ~/academix-backup-install/database-backup.sh ~/academix-backup-install/academix-database-backup.service ~/academix-backup-install/academix-database-backup.timer ~/academix-backup-install/supabase-ca.crt
  rmdir ~/academix-backup-install"
