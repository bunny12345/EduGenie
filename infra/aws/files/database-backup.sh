#!/usr/bin/env bash
set -euo pipefail
umask 077
source /etc/academix-backup.conf

success=0
report_status() {
  aws cloudwatch put-metric-data --region "$AWS_REGION" \
    --namespace AcademiX/Backups --metric-name DatabaseBackupSuccess \
    --value "$success" --unit Count
}
trap report_status EXIT

/usr/bin/python3 /opt/academix-backup/backup_db.py \
  --env-file "$BACKUP_ENV_FILE" \
  --output-dir /var/lib/academix-backups \
  --tools docker \
  --ssl-root-cert /opt/academix-backup/supabase-ca.crt \
  --s3-uri "s3://${BACKUP_BUCKET}/database"
success=1
