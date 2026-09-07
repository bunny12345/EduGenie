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
  `backend/local-data/uploads` only lives on the instance's local disk today —
  a replaced instance starts with an empty uploads folder. Migrating uploads to
  S3 is on the roadmap for exactly this reason.
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
