# AcademiX AWS infra (Terraform)

This directory is the "if something goes wrong, run this" recovery pipeline
for the `academix.now` production deployment. It codifies everything that was
set up manually in the AWS console/CLI:

- EC2 instance running the Dockerized NestJS backend, behind an ALB (HTTP:80 + HTTPS:443)
- ACM certificates for `academix.now`/`www.academix.now` (CloudFront) and `api.academix.now` (ALB)
- S3 + CloudFront for the React frontend, with the ALB added as a second
  CloudFront origin so API calls (`/auth/*`, `/chat/*`, etc.) are proxied to
  the backend under the *same* domain — no CORS, no mixed content, and no
  dependency on the API's own HTTPS cert for the site to work
- Route 53 records for all of the above
- Daily EC2 disk snapshots and private S3 database-backup storage, retained seven days

See [`/DEPLOYMENT_PLAN.md`](../../DEPLOYMENT_PLAN.md) at the repo root for the
full narrative history of how this was built.

## What's intentionally NOT managed here

- **The Route 53 hosted zone itself** (`data "aws_route53_zone"`, not a
  resource). Recreating it would assign new nameservers and break the domain
  until Namecheap is updated again — too risky to let `apply`/`destroy` touch it.
- **The EC2 key pair.** Referenced read-only via `data "aws_key_pair"`. The
  private key lives only on operators' machines at `~/.ssh/academix/academix-backend.pem`,
  never in this repo.
- **App code deployment.** Terraform provisions infra only; use `./deploy.sh`
  (see below) to actually get the backend/frontend code running.

## Prerequisites

- Terraform >= 1.5 (`terraform -version`)
- AWS CLI configured with a profile that is an **IAM user, not the account root
  user** (`aws sts get-caller-identity --profile default` should NOT show `:root`)
- `~/.ssh/academix/academix-backend.pem` present for SSH-based deploys

## Remote state

State lives in S3 (`s3://academix-terraform-state-931886962745/academix/terraform.tfstate`),
locked via Terraform's native S3 lockfile mechanism (`use_lockfile`, no DynamoDB
needed). This is required so local runs and CI share the same source of truth —
without it, GitHub Actions would think no resources exist and could try to
recreate everything already live in production.

## GitHub Actions

[`.github/workflows/aws-infra.yml`](../../.github/workflows/aws-infra.yml) is
**manual-trigger only** (`workflow_dispatch`) — it never runs on push or pull
request, since every run can affect real, billable production infrastructure.

Go to Actions → "AWS Infra (Terraform)" → Run workflow, and choose:

- **`plan`** — shows what would change, makes no changes.
- **`apply`** — actually runs `terraform apply -auto-approve`. This is the
  "run the pipeline to fix it" button.

Required repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access key for an IAM user with permissions to manage EC2/ELB/ACM/S3/CloudFront/Route53 |
| `AWS_SECRET_ACCESS_KEY` | Corresponding secret key |

Use a dedicated least-privilege CI user, not the same credentials as your local
`default` profile, and never the account root user.

## Day-to-day commands

```bash
cd infra/aws
terraform init      # first time only, or after changing provider versions
terraform plan       # see what would change — should show "No changes" if nothing drifted
terraform apply       # apply any pending changes
```

## Recovery scenarios

- **Someone deleted/broke an AWS resource by hand** (SG rule, listener, S3
  policy, CloudFront behavior, etc.): run `terraform plan` to see the drift,
  then `terraform apply` to restore it to the last-known-good config in this repo.
- **The EC2 instance was replaced** (terminated, or Terraform recreated it):
  run `terraform apply` to get a fresh instance with Docker installed, then
  `./deploy.sh backend` to build and start the app container on it. Note:
  `backend/local-data/uploads` lives on the instance's local disk. Recover it
  from a completed disk snapshot before directing users to the replacement;
  provisioning a new instance alone does not restore uploads.
- **Adding a new backend controller:** add its route prefix to
  `backend_route_prefixes` in `variables.tf`, then `terraform apply` — this adds
  a new CloudFront cache behavior proxying that path to the ALB. Skipping this
  step means the new routes will 404 through `academix.now` even though they
  work when hitting the ALB directly.
- **Your home IP changed and SSH access stopped working:** the backend
  security group's SSH rule (`ssh_allowed_cidr`, default `0.0.0.0/0`) is
  intentionally wide open because the observed home connection's public IP
  rotates every minute or so (CGNAT), making a per-IP allowlist impractical.
  SSH is key-only auth. If you want to lock this down, set `ssh_allowed_cidr`
  to a stable IP/VPN CIDR, or better, migrate to AWS Systems Manager Session
  Manager (no inbound port needed at all).

## Deploying app code

Terraform only provisions infrastructure. To actually build and run the app:

```bash
./deploy.sh backend    # rsync backend/src + Dockerfile to the EC2 instance, rebuild image, restart container
./deploy.sh frontend   # build the React app, sync to S3, invalidate CloudFront
./deploy.sh all        # both
```

`deploy.sh` looks up the instance's *current* public IP each time (it changes
on every stop/start since there's no Elastic IP), so it always works even
right after a reboot.

## Daily backups

Terraform provisions:

- DLM snapshots of every EBS disk attached to the tagged backend instance,
  daily at **03:00 UTC**, with seven-day retention. These are crash-consistent
  disk snapshots, not coordinated database/application checkpoints.
- `academix-backups-<account-id>`: private S3 storage with all public access
  blocked, HTTPS-only access and SSE-S3 encryption. Objects under `database/`
  expire after seven days (S3 lifecycle deletion is asynchronous).
- An EC2 instance role limited to writing/reading backup objects and publishing
  the backup-status metric. No static AWS keys are installed on the server.
- CloudWatch alarm `academix-database-backup-missing-or-failed`: alarms when no
  success has been reported for the daily 26-hour window. A success is published
  only after dump validation, upload and an independent download/checksum match.
  The alarm currently has **no email/SMS subscription**: inspect it in CloudWatch
  or add an approved notification destination separately. DLM execution errors
  must also be checked in the EC2 Lifecycle Manager console.

**Encryption boundary:** the existing backend disk is unencrypted. Per operator
choice, DLM snapshots inherit that state; they are private but **not encrypted**.
No live disk replacement/restart is performed by this backup setup. Database
archives in S3 are encrypted. Enable encrypted disk recovery/copies separately
before representing all backups as encrypted.

After applying and reviewing Terraform's plan, install the database job:

```bash
./install-backups.sh
```

The installer requires a valid `BACKUP_DATABASE_URL` privately configured in
`backend/.env` (or its environment). Alternatively, pass the **non-secret**
Session pooler hostname copied from Supabase's Connect dialog:

```bash
bash install-backups.sh aws-0-YOUR-REGION.pooler.supabase.com
```

That form derives the pooled username/project from the existing direct
`DATABASE_URL` and reuses its privately configured database password. It does
not reset credentials, edit the app's environment or deploy/restart the app.
An incorrect database password must be corrected privately before backups can
succeed. Never send the URL or password through chat, commits or shell arguments.
The dedicated connection is installed as root-readable `/etc/academix-backup.env`.
The Supabase CA is downloaded over HTTPS from the official distribution bucket
and pinned by SHA-256 fingerprint; certificate/hostname verification stays on.
The PostgreSQL 18 tools image is pulled during installation, not on every run.

The installer activates `academix-database-backup.timer` at **02:00 UTC daily**
(up to five minutes jitter). `Persistent=true` catches missed runs when EC2
starts again; an instance left stopped cannot take its scheduled database dump.
It uses Python 3 and a temporary, memory/CPU-limited PostgreSQL tools container,
without restarting the backend. Failed runs are nonzero and publish a failure
metric; there is no fallback to partial REST exports.

Run and inspect an initial backup on the backend host:

```bash
sudo systemctl start academix-database-backup.service
sudo systemctl show academix-database-backup.service -p Result -p ExecMainStatus
sudo journalctl -u academix-database-backup.service -n 20 --no-pager
sudo systemctl list-timers academix-database-backup.timer --no-pager
```

`Result=success` plus the runner's `offsite_download_verified=true` confirms a
completed database backup. A configured timer/bucket alone does not. Verify
completed disk snapshots separately in EC2 → Snapshots and their DLM policy tag;
an enabled DLM policy alone does not prove its first snapshot has completed.

### Recovery rehearsal

1. Pick a completed snapshot/archive preceding the incident; check timestamps
   and seven-day retention. Never restore over production to test a backup.
2. Database: download the selected private S3 archive to a restricted location.
   Run `pg_restore --list ARCHIVE.dump`, then restore with `pg_restore
   --exit-on-error --no-owner --dbname=ISOLATED_DATABASE ARCHIVE.dump` using
   privately configured `PG*` connection settings. The target needs compatible
   Supabase roles, schemas and extensions; do not treat a vanilla empty Postgres
   installation as a drop-in Supabase replacement.
3. Check row counts, login/invite flows, RLS/grants and representative
   homework/tests/chat before approving recovery. Catalog/checksum verification
   on production runs is not a full restore test. The automated test restores
   fixture data/policies/grants only.
4. EC2: create a volume from a completed snapshot in the recovery instance's AZ,
   attach it to an **isolated** instance, and recover `backend/local-data`
   (including uploads and fallback accounts). Do not overwrite or detach the
   running production root volume. Snapshots contain credentials and personal
   data: restrict access and do not publish snapshots/AMIs.
5. Supabase Storage blobs, if used, need separate object-content backup coverage;
   a database dump covers storage metadata only. Seven days is the selected
   recovery window, not point-in-time recovery or a promise of zero data loss.

## Known gotchas (learned the hard way)

- **`user_data` and `ami` are in `lifecycle.ignore_changes`** on purpose.
  Changing an EC2 instance's `user_data` can only take effect via a
  stop/modify/start cycle — letting Terraform "fix" harmless whitespace drift
  here would silently reboot production on every `apply`.
- **Stopping the EC2 instance to save money is fine** and doesn't need
  Terraform at all — just `aws ec2 stop-instances`/`start-instances`. The ALB
  and CloudFront both track the instance by ID, so `academix.now` keeps working
  through a stop/start with zero Terraform involvement. The only thing that
  breaks is direct SSH (new public IP) — update `ssh_allowed_cidr` and
  `terraform apply`, or just SSH's current 0.0.0.0/0 default already covers it.
- **Never commit `backend/.env`, the `.pem` key, or `terraform.tfstate`** (the
  state file contains some resource attributes verbatim). Add a `.gitignore`
  in this directory if one doesn't already cover `*.tfstate*` and `.terraform/`.
