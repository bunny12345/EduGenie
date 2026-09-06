# AcademiX Deployment Plan — academix.now on AWS

## TL;DR on the proposed plan

Hosting the **backend** on AWS is the right call. Using **API Gateway to host
the website** is the one part I'd change — API Gateway is built to front an
API (usually backed by Lambda), not to serve a static React build. For a CRA
SPA the standard AWS pattern is **S3 (static files) + CloudFront (CDN/HTTPS)**.

I'd also avoid **Lambda** for the backend itself (even though "API Gateway +
Lambda" is the classic serverless pairing): this app keeps in-memory fallback
stores (accounts, homework, announcements — see `student-auth.service.ts` /
`local-feed.service.ts`) that only work because the Node process stays alive
between requests. Lambda tears down/reuses instances unpredictably, so those
fallbacks would become unreliable. A normal long-running container (EC2 or
ECS Fargate) keeps that behavior intact exactly as documented in
`copilot-instructions.md`.

## Recommended architecture

| Piece | Service |
|---|---|
| Frontend (React build) | S3 bucket (private) + CloudFront distribution |
| Backend (NestJS, Dockerized) | EC2 (fastest to start) or ECS Fargate (more ops-friendly later) behind an Application Load Balancer |
| Domain | Route 53 hosted zone for `academix.now` |
| TLS certs | ACM — one for CloudFront (must be in `us-east-1`), one for the ALB (in your chosen region) |
| Database | Supabase — unchanged, no migration |
| Email (OTP) | Existing SMTP setup — unchanged |

`academix.now` → CloudFront (frontend). `api.academix.now` → ALB → backend container.

## ⚠️ Security flag before we touch AWS

Your AWS CLI is currently configured with **root account credentials**
(`arn:aws:iam::915093572664:root`). Using the root user for day-to-day
deployment work is an AWS anti-pattern — a leaked/misused key has unlimited
account access (billing, IAM, everything). Before provisioning anything, I'd
strongly recommend creating a dedicated IAM user (or role) with only the
permissions deployment needs, and using that instead. Happy to help set that
up first.

## Phase 0 — Prep (done in this session)

- [x] `backend/Dockerfile` (multi-stage build) + `.dockerignore`
- [x] CORS now reads `ALLOWED_ORIGINS` (comma-separated) env var, defaulting
      to the old permissive behavior when unset — set it to
      `https://academix.now,https://www.academix.now` in production
- [x] Confirmed AWS CLI `default` profile is now an IAM user (`admin-user`,
      account `931886962745`, region `ap-south-1`) — no longer root
- [x] Region decided: `ap-south-1`
- [ ] Rotate `SUPABASE_JWT_SECRET` — it's currently the literal string
      `dev-insecure-secret` in `backend/.env`; must be a real random secret in production
- [ ] Decide production `LLM_PROVIDER` — `.env` currently has `OLLAMA_ONLY=true`,
      but Ollama needs a local GPU-ish model server that a small EC2 box won't run well;
      switching to `LLM_PROVIDER=openai` (the `OPENAI_API_KEY` is already set) is simplest for launch

## Phase 1 — Domain & certificates

- [x] Route 53 hosted zone created for `academix.now`
      (Hosted Zone ID: `Z00076871CJRZNP45H78P`)
- [ ] **Action needed from you:** update `academix.now`'s nameservers at your
      registrar to:
      - `ns-1318.awsdns-36.org`
      - `ns-50.awsdns-06.com`
      - `ns-729.awsdns-27.net`
      - `ns-1542.awsdns-00.co.uk`
- [x] ACM certificate requested for `academix.now` + `www.academix.now` in
      **us-east-1** (for CloudFront): `arn:aws:acm:us-east-1:931886962745:certificate/49660e0e-510c-47a6-89da-47a98cba90e1`
- [x] ACM certificate requested for `api.academix.now` in **ap-south-1** (for the ALB):
      `arn:aws:acm:ap-south-1:931886962745:certificate/ae3aa553-fffa-464f-b20b-85a3797a4e5c`
- [x] DNS validation CNAME records for both certs added to the hosted zone —
      certs will move from `PENDING_VALIDATION` to `ISSUED` automatically once
      the nameserver change above propagates (can take up to ~48h, usually much faster)

## Phase 2 — Backend hosting

- [x] EC2 instance launched (`t3.small`, Amazon Linux 2023, instance id `i-09634ed5e8cb9575b`,
      public IP `3.6.93.168`), Docker installed via user-data
- [x] Security groups: `academix-alb-sg` (public 80/443) and `academix-backend-sg`
      (port 3000 only from the ALB, port 22 only from the current dev machine's IP)
- [x] SSH key pair `academix-backend` — private key saved to `~/.ssh/academix/academix-backend.pem`
- [x] Backend image built and running in Docker on the instance (`docker run -d --restart unless-stopped -p 3000:3000`)
- [x] Added a public `GET /health` endpoint (`backend/src/controllers/health.controller.ts`) for the ALB health check
- [x] Application Load Balancer `academix-backend-alb` (HTTP:80 listener → target group on port 3000) —
      target is healthy
- [x] Route 53 alias record: `api.academix.now` → ALB
- [x] Production `.env` deployed to the server with a rotated `SUPABASE_JWT_SECRET`,
      `LLM_PROVIDER=openai` (switched off Ollama), and `ALLOWED_ORIGINS=https://academix.now,https://www.academix.now`
- [ ] HTTPS listener (port 443) on the ALB — blocked until the `api.academix.now` ACM cert
      finishes DNS validation (needs the nameserver propagation below)
- [ ] Longer-term: push the repo (with Dockerfile) to GitHub so the server can `git pull` instead
      of relying on `rsync`/`scp` for updates; set up a simple redeploy script or CI/CD

## Phase 3 — Frontend hosting

- [x] Production build created with `REACT_APP_API_URL=https://api.academix.now`
- [x] Private S3 bucket `academix-frontend-931886962745` (all public access blocked)
- [x] CloudFront distribution `E2E22WW9CW3J01` (`d3adr2xq66otbs.cloudfront.net`) using
      Origin Access Control — bucket policy only allows this distribution to read objects
- [x] SPA fallback: 403/404 → `/index.html` (200) configured
- [x] Build uploaded to S3, distribution deployed and serving (`https://d3adr2xq66otbs.cloudfront.net/` → 200)
- [ ] Add `academix.now` + `www.academix.now` aliases and the ACM cert to this distribution
      once the cert validates (blocked on nameserver propagation)
- [ ] Route 53 alias records: `academix.now` and `www.academix.now` → CloudFront (after the above)

## Phase 4 — Cutover & verification

- [x] Nameserver propagation confirmed (public resolvers resolve correctly)
- [x] CloudFront ACM cert (`academix.now`/`www.academix.now`) — `ISSUED`
- [x] CloudFront distribution updated with aliases `academix.now`/`www.academix.now` + cert attached
- [x] Route 53 alias records: `academix.now` and `www.academix.now` → CloudFront
- [x] **Verified live**: `https://academix.now`, `https://www.academix.now`, and
      `http://api.academix.now/health` all return `200`
- [ ] ALB ACM cert (`api.academix.now`, ap-south-1) still `PENDING_VALIDATION` —
      DNS record is correct and publicly resolvable, just needs more time to validate.
      Once `ISSUED`: add an HTTPS:443 listener to the ALB with this cert (currently HTTP:80 only)
- [ ] Smoke test all three portals (school/teacher/student) against `https://academix.now`
- [ ] Confirm OTP emails send from the production server
- [ ] CloudWatch alarms (ALB 5xx rate, EC2 status checks)
- [ ] Move `local-data/uploads` to S3 later (currently on the EC2 instance disk)
- [ ] Commit + push the Dockerfile/health-controller/CORS changes to GitHub so future
      deploys can `git pull` on the server instead of manual `scp`/`rsync`

## Provisioned resource reference

| Resource | Id / Address |
|---|---|
| Route 53 hosted zone | `Z00076871CJRZNP45H78P` |
| Registrar nameservers to set | `ns-1318.awsdns-36.org`, `ns-50.awsdns-06.com`, `ns-729.awsdns-27.net`, `ns-1542.awsdns-00.co.uk` |
| ACM cert (CloudFront, us-east-1) | `arn:aws:acm:us-east-1:931886962745:certificate/49660e0e-510c-47a6-89da-47a98cba90e1` |
| ACM cert (ALB, ap-south-1) | `arn:aws:acm:ap-south-1:931886962745:certificate/ae3aa553-fffa-464f-b20b-85a3797a4e5c` |
| EC2 instance (backend) | `i-09634ed5e8cb9575b` / `3.6.93.168` |
| ALB | `academix-backend-alb` / `academix-backend-alb-1161870313.ap-south-1.elb.amazonaws.com` |
| Target group | `academix-backend-tg` |
| S3 bucket (frontend) | `academix-frontend-931886962745` |
| CloudFront distribution | `E2E22WW9CW3J01` / `d3adr2xq66otbs.cloudfront.net` |
| SSH key | `~/.ssh/academix/academix-backend.pem` (key pair name `academix-backend`) |

## Decisions already made

1. Region: `ap-south-1` ✅
2. Backend hosting: EC2 ✅
3. IAM: switched off root, now using IAM user `admin-user` (account `931886962745`) ✅
4. Uploads: staying on the EC2 instance disk for the first launch ✅
