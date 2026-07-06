# EduGenie Backend Prototype

This is a small NestJS-style prototype intended to provide a `/chat` endpoint that forwards prompts to a local LLM service and stores minimal memory via Supabase.

Quick start (development):

1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:

```bash
cd backend
npm install
```

3. Run in dev mode (auto-reloads):

```bash
npm run start:dev
```

The server starts on `PORT` from `.env` (default 3000) and exposes `POST /chat`.

Database migrations
-------------------

This prototype uses Postgres with the `vector` extension for embeddings. To run the provided SQL migration:

1. Ensure `DATABASE_URL` is set to your Postgres connection string (Supabase provides this in project settings).
2. From the `backend` folder run:

```bash
export DATABASE_URL="postgres://user:pass@host:5432/dbname"
bash scripts/run_migrations.sh
```

On Supabase you can also paste the contents of `db/init.sql` into the SQL editor and run it.

Supabase setup (quick)
----------------------

1. Create a free project at https://app.supabase.com and open the project.
2. In Project Settings → API copy the `URL` and the `Service Role` key.
3. Add environment variables to your `.env` (recommended) or export in your shell:

```bash
export SUPABASE_URL="https://your-project-ref.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<your service role key>"
export DATABASE_URL="postgres://user:pass@host:5432/dbname" # optional for psql migrations
```

4. Run the SQL in `db/init.sql` using the Supabase SQL editor (Dashboard → SQL Editor → New query) or run the `scripts/run_migrations.sh` against your `DATABASE_URL`.

Notes about keys
- Use the `Service Role` key on the backend only (never expose it to clients). The server will prefer the service role key automatically.
- For client-side usage (mobile/web) use the anon/public key with restricted RLS policies.


Files added:
- `db/init.sql` — creates `students`, `messages`, `memories`, and `homework` tables.
- `scripts/run_migrations.sh` — helper script to run the SQL using `psql`.

