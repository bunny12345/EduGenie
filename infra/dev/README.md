# AcademiX development environment

A cheap, disposable copy of the stack for testing the website and app **before**
releasing to production. It uses **fake data only**; no production data is copied.

| | Development | Production |
|---|---|---|
| URL | `https://dev.academix.now` | `https://academix.now` |
| Database | Supabase project `AcademiX-Dev` (`mgrkatzzzkuyudwakshx`) | `EduGenie` (`htydcedtuuczxjwtqrqx`) |
| Compute | one EC2 `t3.small` (`i-052e104af76d23a8d`), Docker: NestJS backend + Caddy (HTTPS, website) | EC2 + ALB + CloudFront |
| Terraform state | `academix/dev/terraform.tfstate` | `academix/terraform.tfstate` |
| Access | only your ISP range (SSH + HTTPS) | public |
| Backups / DR / auto scaling | **none, by design** | planned (see `docs/scaling-disaster-recovery-plan.md`) |

Data and credentials are isolated: separate database, service key, session-signing
secret, SSH key and security group. The dev backend gets **only** the OpenAI
settings from `backend/.env` (shared by your decision, so AI usage is billed to
the same account). Email, SMS, push and owner credentials are **not** copied, so
dev cannot message real people. Consequences: OTP/email verification and push
notifications do not work in dev, which is why accounts are seeded directly.

## Daily use

```bash
cd infra/dev
./dev.sh up          # start host, allow your IP, point DNS (takes ~1-2 minutes)
./dev.sh status
# ...test at https://dev.academix.now ...
./dev.sh down        # STOP when finished: stops compute billing, removes DNS
```

After `down`/`up` the public IP changes; `up` fixes DNS and the firewall
automatically. Data lives in the dev Supabase project, so it survives.

### Deploying the code you want to test

```bash
./dev.sh deploy all        # or: backend | web
```

Run this from the branch you want to test. The website is built against the dev API
and dev database; the script **refuses** to continue if the build contains the
production Supabase project id. **Never use `infra/aws/deploy.sh`**: it targets production.

### Test accounts (fake)

```bash
./dev.sh seed                       # idempotent; creates a school, 3 teachers, 6 students
cat ~/.academix-dev/test-accounts.txt   # logins and random passwords (mode 600, not in git)
```

Teachers: `dev-teacher-math` (Class 5 only, tests single-class auto-select),
`dev-teacher-science` (Classes 5 and 6, tests the class picker), `dev-teacher-english`
(Class 7). Students: `dev-student-5a/5b/6a/6b/7a/7b`. School login: `dev-school@academix-dev.test`.

### If you cannot reach the site

Your ISP rotates your IP, so the firewall allows your ISP's /16 range rather than one
address. If you changed network (VPN, phone hotspot, another Wi-Fi):

```bash
./dev.sh allow-me           # replace the allow-list with your current network
./dev.sh allow 203.0.113.0/24   # additionally allow another range
ALLOW_PREFIX=32 ./dev.sh allow-me   # strictest: this exact IP only (may lock you out when it rotates)
```

## Testing the mobile app against dev

The release app points at production. Build a separate test build:

```bash
cd mobile
flutter build apk --debug --dart-define=API_BASE_URL=https://dev.academix.now
```

The debug build is signed differently from the Play version but shares its package id,
so uninstall the Play version on that test phone first (or use a spare device).
The phone must be on a network allowed by `./dev.sh allow...` (home Wi-Fi works).
Mobile data uses other carrier ranges and will be blocked.

## One-time setup (already done; for rebuilding from scratch)

```bash
./dev.sh init          # SSH key (~/.ssh/academix/academix-dev.pem), Terraform apply
./dev.sh up
./dev.sh db-bootstrap  # applies db/baseline-schema.sql + db/align-grants.sql (schema only)
./dev.sh deploy all
./dev.sh seed
```

`db/baseline-schema.sql` is a schema-only export of the production `public` schema
(61 tables, 76 RLS policies, functions, grants) with **no rows**. `align-grants.sql`
resets `anon`/`authenticated` table privileges to exactly match production (without
it Supabase's default grants add `TRUNCATE`, which bypasses RLS). Both were verified to
match production counts and privileges. When production gets a new migration, add it
to dev (apply the migration file to the dev project) before testing the new release.

Prerequisites on your computer: `aws` (profile with EC2/Route53/S3-state access),
`terraform`, `supabase` CLI logged in, `jq`, `rsync`, `node`, and `backend/.env`
(only to read the shared OpenAI settings).

## Cost (approximate; check AWS and Supabase billing)

- Running: t3.small about $0.02/hour (roughly $0.55/day) plus a public IPv4 (~$0.005/hour).
- Stopped: the 20 GB encrypted disk, about $2/month. Nothing else in AWS.
- Supabase: the dev project uses a free-plan project slot; free projects are paused after
  a week of inactivity (restore from the dashboard). Check your plan's limits.
- OpenAI usage is shared with production.
- Stop it with `./dev.sh down` when you're not testing. Add an AWS Budget alert if you want
  a safety net; stopping is not automatic.

## Removing it

```bash
./dev.sh destroy --yes      # deletes the host and security group (Terraform, dev state only)
```

The dev Supabase project is separate; delete it from the Supabase dashboard if you no longer need it.

## Limitations to know about

- Port 80 is open to the world only for certificate issuance and the HTTPS redirect;
  it serves nothing else.
- No monitoring or alerts. Check `./dev.sh status` and `ssh` + `docker logs academix-backend`.
- Uploads and fallback data live on the host disk (`/srv/academix/backend/local-data`) and
  are lost if you `destroy`.
- Seeded accounts bypass OTP verification flows, so verify registration/OTP behavior separately
  (production uses Twilio, which dev intentionally lacks).
