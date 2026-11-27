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

## GitHub Actions: build, deploy and stop

The manually triggered **Development deployment** workflow uses the selected
branch's committed code, not uncommitted local changes. It targets only the
existing dev host and database; it never invokes the production deployment.
It does not apply database migrations or seed data. Apply and verify any
required migration separately against **dev only**, without changing RLS.

### One-time setup

These steps require repository administrator access and AWS IAM/CloudFormation
permissions. Do not paste credentials into chat or commit them.

1. Make the workflow available on the repository's default branch. In GitHub
   Settings > Environments create an environment named `dev`. Restrict its
   deployment branches to branches you trust and enable required reviewers if
   available. Environment approval and branch protection are important: the
   OIDC role trusts workflows using this environment, and those workflows can
   deploy code with access to dev's backend credentials and data.
2. In AWS account `931886962745`, ensure an IAM OIDC identity provider exists
   for `https://token.actions.githubusercontent.com` with audience
   `sts.amazonaws.com`. Use the existing provider if present.
3. In CloudFormation, create a stack from
   [`github-actions-role.yaml`](github-actions-role.yaml), supplying that OIDC
   provider's ARN and acknowledging named IAM resource creation. Copy the
   stack's `RoleArn` output. This role can operate only the existing dev
   instance, its security group, and the dev A record; it cannot deploy
   production. The role and instance IDs are specific to this installation.
4. In GitHub Settings > Environments > `dev` > Environment secrets, add:
   - `DEV_AWS_ROLE_ARN`: the CloudFormation `RoleArn`.
   - `DEV_SSH_KEY`: the complete contents of the existing dev private SSH key
     (`~/.ssh/academix/academix-dev.pem`). Treat it as sensitive.
   - `DEV_SSH_KNOWN_HOST`: the verified host's **ed25519 public host key** in
     known_hosts format, with `dev.academix.now` as the first field. Obtain it
     over an already trusted SSH connection by reading
     `/etc/ssh/ssh_host_ed25519_key.pub`, then prepend `dev.academix.now `.
     Verify its fingerprint independently; do not blindly trust `ssh-keyscan`.
     Replace it if the dev host is rebuilt.
   - `DEV_SUPABASE_ANON_KEY`: the **AcademiX-Dev** project's legacy anon JWT, not the
     production key. This public client key is embedded in the website build;
     RLS is still required. The workflow checks the JWT's project reference and
     `anon` role (not its signature). Never use a service-role key here.

The backend's existing `/srv/academix/backend/.env` stays on the instance.
Actions checks its Supabase URL is the dev project before deployment. Set up
that file separately using the existing local procedure; the workflow does not
recreate it or import production credentials. Secrets are accessible to trusted
workflow code; do not run untrusted branches in the `dev` environment.

### Running it

1. In GitHub, open **Actions > Development deployment > Run workflow** and
   select the committed branch and `deploy`. The run checks the backend build,
   runs web and Flutter tests, builds the dev website and Android debug APK,
   starts the instance, updates dev DNS, deploys and checks `/health` and the
   website. It leaves the instance running for testing.
2. Open `https://dev.academix.now` from an approved network. Download
   `academix-dev-android-apk` from the successful run's **Artifacts** to
   install on an Android device. GitHub cannot open Chrome or install an app
   on your device automatically. The APK is not published to Google Play and
   cannot be promoted as a production release.
3. Run the workflow again with `stop` when finished; use `start` to resume
   without redeploying. Start changes DNS but deliberately does **not** change
   your approved network ranges. Manage those locally with `./dev.sh allow...`.
   DNS and certificate readiness can take time after starting.

The full existing test suites currently have failures. A normal deployment
stops on failed tests; after reviewing the run logs you may explicitly select
`allow_failed_tests` to deploy to **dev only** for investigation. The run
summary flags that override. Build failures still block deployment. Passing
these automated checks does not prove complete user flows, authorization or
production readiness.

The deploy job temporarily adds its runner's exact IPv4 address to SSH and
HTTPS, and removes only its own rules on exit. If a runner is abruptly lost,
cleanup may not run: check the dev security group for rules described
`GitHub-Actions-dev-deploy` and remove stale rules. Existing user rules are
preserved. The current local `allow-me` default is a broad ISP /16, not a
single user, and should be tightened when practical.

There is no production promotion pipeline yet. A future production release
must use its own production configuration, signing and explicit approval;
the debug APK is dev-only. iOS/TestFlight automation is not included.

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
resets `anon`/`authenticated` table privileges to match production (without
it Supabase's default grants add `TRUNCATE`, which bypasses RLS). Counts and
privileges were compared, but policy definitions and complete isolation were
not independently verified. When production gets a new migration, add it
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
