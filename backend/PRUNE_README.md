# Prune script (duplicate memories)

This document explains the `scripts/prune.sh` helper which calls the local `/chat/prune_memories` endpoint to remove duplicate `memories` rows (keeps latest row per student_id+key).

Prerequisites
- Backend server running locally on `http://localhost:3000` (the prune endpoint calls this).
- `backend/.env` must include `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`.
- From the repo root the prune script is at `backend/scripts/prune.sh`.

Quick manual test
1. Make the script executable (once):
```bash
cd backend
chmod +x scripts/prune.sh
```
2. Run the script:
```bash
./scripts/prune.sh
```
It prints HTTP status and the JSON response. Exit code is non-zero on failure.

Cron / Scheduling
- Example crontab entry (runs daily at 03:00 and appends logs):
```cron
0 3 * * * /Users/malavikaharidas/prem/EduGenie/backend/scripts/prune.sh >> /var/log/edugenie/prune.log 2>&1
```
- Use `crontab -e` to add the line for your user. Ensure the backend server is running (pm2, systemd, screen/tmux, etc.).

Systemd alternative (optional)
- If you prefer `systemd` create a service + timer on Linux. Cron is simplest for macOS/dev machines.

Troubleshooting
- `SUPABASE_SERVICE_ROLE_KEY not set in .env`: ensure `.env` contains the key and restart server.
- `Prune HTTP status` not 2xx: check the backend server logs, confirm `x-service-role-key` matches server env.
- DNS/DB connectivity: if the server cannot reach Supabase directly the script falls back to using the Supabase REST API; ensure the server process has network access.

Notes and options:
- Webhooks are one-way and simple (good for alerts). Don’t commit the webhook URL to source control.
- For richer behavior (interactive messages, threads, user mentions, or reading Slack), use the Slack Web API with a bot token or the Bolt SDK.
- If you prefer email or PagerDuty/Slack integrations, I can add those instead.
- I can guide you step‑by‑step while you create the app, or add a protected `/chat/notify_test` endpoint so you can test Slack from the server safely — which would you prefer?

Backup helper
---------------
I added `scripts/backup_db.sh` which runs `pg_dump` against `DATABASE_URL` and writes a gzipped SQL file to `backend/backups/`. Usage:

```bash
cd backend
chmod +x scripts/backup_db.sh
./scripts/backup_db.sh
```

If `pg_dump` is not installed on your machine the script will exit with a helpful message — you can also create a backup from the Supabase dashboard (Project → Backups). Always take a backup before running mass-deletes.

If you want, I can also add a `systemd` unit or a GitHub Actions workflow to run pruning on a schedule — tell me which.
