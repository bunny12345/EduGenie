Applying RLS via Terraform (CI-friendly)

Overview
- This Terraform snippet runs a local shell command that applies the RLS SQL files in `backend/db/` using `psql`.
- Intended to be run in CI where `psql` is available and a secure `DATABASE_URL` is provided as a secret.

Files
- `rls_apply.tf` — Terraform resource that invokes the shell script.
- `../db/apply_rls.sh` — Shell helper that runs `psql -f` on the SQL files.

Usage (local)
1. Ensure you have `terraform` and Postgres client (`psql`) installed.
2. From the `backend/infra` directory run:

```bash
terraform init
terraform apply -var="database_url=$DATABASE_URL"
```

Replace `$DATABASE_URL` with your Supabase Postgres connection string (service role URL for admin operations).

Usage (CI)
- Store your Postgres connection string as a secured secret (e.g., `DATABASE_URL`).
- Run the same `terraform init` / `terraform apply` commands in your pipeline, providing `database_url` from the secret.

Security notes
- The connection string must be treated as a secret. Use your CI secret store and avoid printing the URL or the SQL output to logs.
- Service-role credentials bypass RLS and should be used only in CI/admin flows where necessary.

Alternative: direct psql
- If you prefer not to run Terraform, call the helper directly:

```bash
DATABASE_URL="$DATABASE_URL" bash ../db/apply_rls.sh rls_policies.sql rls_policies_roles.sql
```
