# AcademiX Backend Prototype

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

### AI Tutor reply latency

`POST /chat` starts independent profile, message embedding, memory, history,
snapshot and selected-lesson/chunk reads together. Subject-scoped homework
checks overlap with those reads when the subject is already supplied; otherwise
they use the subject resolved from lesson metadata. All required context and
homework checks still finish before calling the model. Lesson document coverage,
topic boundaries, conversation IDs, history fallbacks and response shapes are
unchanged, so this benefits both web and Flutter without client changes.

Snapshot/message persistence, reply embeddings, Orchard activity and mastery
updates remain asynchronous after generation. No shared answer cache, shorter
context, weaker homework checks or model/provider change is introduced.

Validate with:
`node --test -r ts-node/register src/chat/chat.performance.test.ts`
and `npx tsc --noEmit`. The regression includes a simulated-latency budget and
tests context, locked homework, history failures and slow persistence.
Its timing is not a production/model latency measurement. Deploy the backend
for these improvements to reach the live app; provider generation time and
first-time homework-image transcription can still dominate a reply.

Database backups
----------------

`bash scripts/backup_db.sh` creates a PostgreSQL custom-format `.dump` archive,
not the old `.sql.gz` format. Set `BACKUP_DATABASE_URL` privately (preferred)
or use the existing `DATABASE_URL`; quoted URI values are supported. Credentials
are passed through private process/container environments, never command-line
arguments. Remote connections require certificate and hostname verification.
For Supabase use the project's CA certificate with `--ssl-root-cert /secure/ca.crt`.
On IPv4-only servers use the exact **Session pooler** hostname from Supabase's
Connect dialog, port 5432, and the pooled username. HTTPS project URLs, API keys
and Supabase account-login passwords are not PostgreSQL credentials.

The runner writes into a private temporary directory, checks the `PGDMP` header
and `pg_restore --list`, then atomically publishes the archive. Failed/invalid
dumps cannot produce a success-shaped empty backup. `--s3-uri s3://BUCKET/database`
uploads with SSE-S3 encryption, downloads the object again and checks SHA-256
before reporting offsite success or pruning old local archives. S3 retains seven
days; the production runner retains local archives for one day after verified
upload. Upload failures preserve the completed local archive and fail explicitly.
New backups are gitignored; old tracked backup files are not proof of recovery.
The two historical July SQL gzip files were found to contain zero uncompressed
bytes and must not be used as restore points.

This is a full logical database dump, not a physical database snapshot or PITR.
It includes accessible database schema/data/policies/grants, but not cluster roles,
Supabase Storage file contents or files on EC2. Managed roles/extensions must
exist in a compatible restore target. Chat `conversation_snapshots` are application
history, not disaster-recovery backups. Database archives and EC2 snapshots are
independent and are not an atomic cross-system recovery point.

See [AWS backup setup and recovery](../infra/aws/README.md#daily-backups) for
schedules, deployment, monitoring and restore procedures. The existing four-table,
unpaginated `backup_via_rest.sh` export is **not** a complete backup and is not
used by the daily job.

Tests use only a disposable local PostgreSQL cluster:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/test_backup_db.py -v
```

They perform a real fixture restore, verify data/RLS/grants, and check corrupt
archives, failed dumps, upload/download checksum failures, credential redaction
and Docker timeout cleanup. Production's per-run catalog/checksum validation
does not prove a full production restore; rehearse recovery on an isolated
compatible target before relying on these archives for disaster recovery.

Supabase Advisor security hardening
----------------------------------

The 15 "RLS Disabled in Public" alerts and the invitation-token "Sensitive
Columns Exposed" alert are database access configuration findings, not CVE IDs.
The targeted migration is
[`db/migrations/20261110_supabase_advisor_hardening.sql`](db/migrations/20261110_supabase_advisor_hardening.sql).
It enables RLS and revokes both table and column privileges from `PUBLIC`,
`anon` and `authenticated` on the 15 reported tables. No data, columns or
existing policies are dropped or rewritten. These tables are accessed through
the NestJS API, not directly by web/mobile Supabase clients.

Before applying:

1. Confirm the **deployed** backend has `SUPABASE_SERVICE_ROLE_KEY` and the
   existing `SUPABASE_JWT_SECRET` configured. Never put either key in a client
   build. The local mock database remains supported; anonymous database access
   is not a substitute for server credentials.
2. Save the current metadata from
   [`db/verify_supabase_advisor.sql`](db/verify_supabase_advisor.sql) in the
   correct project's Supabase SQL Editor, and review its existing policies and
   grants. Take a normal database backup before production changes.
3. Execute **only the targeted migration** in SQL Editor as the database
   administrator. It is transactional/idempotent and aborts if an expected
   table is absent, backend privileges are missing or inherited client grants
   still expose a table. Do not rerun the old policy scripts: they replace
   policies and are not required here.
4. Rerun the verification query: all 15 tables must have `table_exists` and
   `rls_enabled` true, `anon_access` and `authenticated_access` false, and
   `backend_access` true. Existing policy counts must be unchanged. Rerun
   Supabase Advisor and check login/invite acceptance, chat history, tests,
   flashcards, Quiz Rush, stories and rewards in both clients. An anonymous
   request for `registration_invites?select=token&limit=0` must be denied,
   while the server's service-role request must still succeed.

The backend additionally verifies JWT signatures with HS256, subject and expiry;
missing signing configuration fails closed for production or a configured
Supabase deployment. Mock-only development uses an unpredictable process-local
signing key, so local sessions must log in again after a restart. Unsigned and
fixed-development-secret tokens are not accepted. Owner Supabase MFA validation
is unchanged.

Student reward, test-attempt, progress-write and settings-write operations reject
another student's ID. Teacher test authoring/answer-key access requires ownership
and the same school. Student test lists/start requests are limited to assigned
tests in their school/class, regardless of the requested list filter. Legacy
tests without school/teacher attribution are denied rather than exposed across
schools; review their attribution separately instead of broadening access.
Deploy the backend changes independently; the SQL migration does not deploy code.

Regression checks (no live database/application records are used):

```bash
node --test scripts/test_supabase_hardening.js
node --test -r ts-node/register src/auth/security.test.ts src/auth/owner-auth.test.ts
npx tsc --noEmit
```

The SQL test requires existing local PostgreSQL tools (`initdb`, `pg_ctl`) and
uses its own disposable Unix-socket cluster. It checks all 15 tables, actual
client denial/backend CRUD, unchanged policies/data, repeat application and
transaction rollback. It never uses `DATABASE_URL`.

Dashboard and report performance
--------------------------------

Dashboard profile and summary reads run concurrently where independent, including
the optional streak sources. Existing limits, class filtering, local fallbacks
and dashboard cache behavior remain unchanged. This speeds up the shared API
used by both the website and mobile app without changing its response contract.
Concurrent learning-score requests for the same student share one in-flight
calculation; completed results and failures are not cached. Different students
remain isolated, and all historical evidence and score formulas are unchanged.
No database schema, RLS or infrastructure changes are required.

Validate with:
`node --test -r ts-node/register src/controllers/dashboard.performance.test.ts src/progress/learning-score.service.test.ts`.

Orchard loading performance
--------------------------

An overview reads the curriculum once and reuses synchronized chapters for tree
initialization and mastery counts. Up to three subjects initialize concurrently;
independent summary reads run in parallel. Tree-detail requests initialize only
the requested subject, while school artwork assignments still use the full
allowed subject list. Growth rules, rewards, review ordering and response
contracts are unchanged.

Overlapping identical reads share an in-flight result per student/subject.
Initialization is serialized per student, and overlapping chapter synchronization
is shared per subject/class within the backend process. Completed results and
failures are not cached: later reads still synchronize uploads, renames and
withdrawals and calculate live decay. No migrations or RLS changes are needed.

Checks:
`node --test -r ts-node/register src/orchard/orchard.performance.test.ts src/orchard/orchard.mastery.test.ts src/orchard/orchard.assignments.test.ts src/orchard/orchard.constants.test.ts`
and `npx ts-node scripts/orchard_stage_smoke.ts`.
The performance tests assert query budgets and simulate 80 overlapping identical
requests and 80 distinct students using an in-memory database. They verify
isolation/concurrency, not production capacity; latency and database saturation
still need an authorized staging load test before an 80-user rollout.

Owner-only school registration
------------------------------

All school-registration endpoints require the configured Supabase owner and a
verified authenticator-app MFA session. Set `OWNER_SUPABASE_USER_ID` on the
backend; missing configuration disables school registration. Public school,
teacher and student login and invitation acceptance are unchanged.

See [owner setup, school registration and MFA recovery](../docs/owner-school-registration.md)
before deploying this change. Deploy the backend first, then the website.

Orchard chapter mastery
-----------------------

Both `GET /orchard?studentId=...` and `GET /orchard/:subjectKey?studentId=...` expose
`masteredChapters` (on each overview tree and on `tree` in detail).
This is the unique count of current-class uploaded chapters at stage index 7
(Golden Fruit), not `completedChapters` (which also includes ordinary Fruit).
Chapter growth reads are paginated and scoped to the student and subject.
Withdrawn lessons and growth rows from other classes do not earn acorns.
Both clients use this count for natural-tree fruit artwork; existing stages,
rewards and completion percentages are unchanged. No schema change is needed.
`npx ts-node scripts/orchard_stage_smoke.ts` tests all eight stages for Mathematics
and Science in a disposable file-backed database, including retention failures,
90% roots, independent growth and overview/detail parity. It never uses production.

Learning progress graphs
------------------------

`GET /progress/learning-score` supplies the same daily/monthly histories to web
and mobile. Subject scores combine understanding (20%), tree growth (20%),
tests/mock tests (25%), practice (20%) and homework (15%), renormalizing weights
for components without evidence. Tree growth measures chapter stages from seed
to mastery, not just the number of completed chapters. Only current-class chapter
growth counts. Tests and homework now use actual assignment completion:

- Homework = unique submitted homework / assigned homework × 100. Grades do not
  affect this component; there is no fixed eight-submission target.
- Tests/mock tests = unique completed tests / assigned tests × average percentage
  marks on completed tests. For example, 35/100 completed with an 80% average
  gives 28/100, while 35/100 homework submitted gives 35/100.
- Retries count one test, using its latest graded result; homework resubmissions
  count once. Started/ungraded tests earn no completion credit.
- Only saved attempts linked to currently assigned tests count toward test marks
  and completion. Old unlinked `progress_metrics` test records, mirrored metrics
  and attempts whose tests are no longer in the assigned catalog are excluded.
  Their stored history is not deleted or rewritten.
- Both formulas apply to subject scores, overall dimensions and daily/monthly
  graph points. The existing component weights are unchanged.

`GET /progress` supplies the subject card's **Average Mock Test Score** from the
same latest saved result per test used by the test list, review and graph. The
card shows average marks only; the graph's **Test Scores** component additionally
applies completion. For example, one of two assigned tests at 80% shows an 80%
average card and a 40% graph component. No completed tests means no average card,
but assigned unfinished tests still contribute zero to the graph component.
General practice/activity metrics are not mock-test marks.

Assigned tests are paginated and scoped to the student's school and class,
matching the assigned test catalog (including school-wide tests without a class).
Draft/cancelled tests and future scheduled tests do not enter the denominator.
Homework uses the student's own current-class assignments, including pending work.
Assignment dates use `assigned_at`, then test `start_at`, then `created_at`.
Future assignments do not reduce older graph points. For legacy undated
assignments, the first known completion is used; uncompleted undated assignments
enter only the current snapshot. Deleted-parent homework completions are retained
as inferred completed homework assignments. Tests require a surviving assigned
parent and use its canonical subject, not a subject guessed from old metrics.
Without surviving assignment history, past obligation counts cannot be fully
reconstructed. No schema or RLS changes are made.

Results are linked to their parent assignment and dated by completion.
Legacy `local-test-*` IDs are resolved from the existing local
assignment feed, never sent to Supabase UUID filters. Database attempts take
precedence over local duplicates. Missing test assignment metadata earns no
academic test credit; database errors are surfaced, not presented as missing
or unattempted results. Catalog and attempt reads are paginated in both reports
and test listings.
Submission reports success only after confirming the saved result, and a
finalized result cannot be overwritten by resubmission. Expired attempts are
finalized from their persisted answers; no saved answers means zero marks.
Unsaved browser selections cannot be reconstructed, and no existing marks are
automatically replaced with unrelated historical progress metrics.
Homework assignments are read with `select('*')` and merged with the existing
student-scoped persisted local feed, supporting legacy databases without a
`homework.subject` column. Submitted/resubmitted/graded assignment records with
`submitted_at` provide completion evidence when no attempt row exists. Pending,
other-class and undated assignments earn no dated credit. Real attempts take
precedence; an ungraded assignment's default grade is not treated as zero.
Assignment grade snapshots apply from `graded_at`/`updated_at`, not retroactively.

Each graph point uses the same scoring formula as its current score. Orchard
activity and passed retention reviews replay the existing growth-engine effects
at their recorded dates; games are not needed to unlock a graph. Later game or
test activity does not proportionally rescale past understanding/tree growth.
Practice includes flashcards, revision/recall/application tasks and recorded
practice metrics. Unscored practice uses completion volume (20 tasks = 100%);
accuracy is used when available. Homework grades remain available in homework
records, but do not increase the completion component of the learning score.

The overall nine-dimension weights are unchanged. Understanding now explicitly
includes tree growth, and revision/consistency include non-game learning records.
The overall score is a separate nine-dimension composite, not an average of the
subject-card scores. Its day/month graphs retain the `/1000` scale; subject graphs
use percentages. Only currently registered subject trees contribute to overall
Orchard averages, preventing old removed subjects from diluting them.
Overall consistency includes homework, tests, practice and reward check-in dates
alongside Orchard activity. Historical sunlight is reconstructed from the same
14-day activity window and scale as the Orchard meter when a newer tree snapshot
would otherwise hide it. Later watering does not erase prior confidence evidence.
Assignment-level grades can complement an ungraded attempt at their recorded
grading date, while completion counts stay unique and old-class homework is excluded.
Mirrored test/homework metrics are not treated as practice. Historical generic
test metrics do not enter the mock-test average or assignment completion score.
Historical mutable snapshots (such as flashcard review totals or legacy growth
without a complete activity ledger) only apply from their last recorded update;
missing historical evidence is not invented. Future months remain null, and the
monthly window includes the current academic year, capped at 24 months.
No database migration or data seeding is needed. Deploy the backend to update both
clients' calculations.

Regression command:
`node --test -r ts-node/register src/progress/learning-score.service.test.ts`

Orchard school tree assignments
-------------------------------

Apply `db/migrations/20261112_orchard_school_tree_assignments.sql` once **before**
deploying this backend. It creates one new school-scoped mapping table and a
service-role-only atomic allocator; it does not alter existing tables or RLS.
Missing migration/invalid allocation responses produce a visible Orchard error.

There are ten artwork themes: acorn, apple, cherry, orange, pear, mango, lemon,
peach, plum and strawberry. The first Orchard read assigns each registered subject
in that student's class a school-wide design. Registered base subjects prefer
their usual designs when unused; extra subjects prefer the four new themes.
All ten designs are used before reuse. After ten assignments, the least-used
design is reused (ties use fixed pool order). Different schools allocate
independently. Assignments persist across refreshes, new students, server restarts,
class changes and new subjects; an absent subject retains its mapping if re-added.
A later base subject uses an unused design if its usual design is already taken.

Only class-registered subjects appear in the student's Orchard. Reused artwork
does not share learning data: chapters, milestones, mastery, resources and rewards
remain keyed by student + subject. Overview and detail return the same assigned
`treeType`, natural `fruitType` and presentation metadata to both clients.
Existing global subject catalog entries are not rewritten. Development's
file-backed mock store uses the same allocation order and serializes local writes.
Strawberry returns `treeType: strawberry`, `fruitType: strawberry` and 🍓
metadata. The existing SQL allocator's legacy `coconut` slot is normalized on
read, preserving saved assignments without rewriting tables or policies.
The file-backed allocator uses the canonical strawberry key. Both clients use
strawberry-named asset folders and accept the old key for compatibility.
No additional migration is required.

Student technical support
-------------------------

Website Technical Query now provides operational help, saved glitch reports and
technician chats. Notifications use the existing SMTP service; the MFA owner
Support Inbox handles replies. Apply the new support migration before enabling
requests. See [student support setup and workflows](../docs/student-technical-support.md).

Public school enquiries
-----------------------

The login website has a welcome assistant for prospective schools. The public
bot is a curated feature guide (no LLM, database records or account access).
It explains personal AI tutoring, after-school learning, homework/exam practice,
progress reports, school-name/logo branding and feature development on demand.
Branding is offered through onboarding; custom scope, price and timeline are
agreed with the admin. The assistant does not promise unbuilt features are live.

**Setup, before enabling admin chat:**

1. Apply `db/migrations/20261110_school_enquiries.sql` **once** in the Supabase
   SQL editor. This independent migration creates three new enquiry tables and
   service-only functions. It does not alter school/account-support tables or
   their RLS. No support-migration prerequisite is needed for this migration.
2. Ensure backend `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the existing
   SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
   are configured. Never put the service key or SMTP credentials in the website.
3. Notifications go to the existing `SUPPORT_NOTIFICATION_EMAIL` override, or
   the configured default admin mailbox. The requester receives verification
   codes and admin-reply notifications at their verified email address.
4. Deploy backend first, then website. Existing CloudFront `support*` and
   `owner/support*` forwarding covers these endpoints; keep caching disabled
   and forward Authorization. No production deployment is performed by tests.

**Workflow:** visitor supplies name, school, email, message and explicit consent.
A random six-digit code expires after 10 minutes and allows five attempts.
Only its challenge-bound SHA-256 hash is stored. Verification atomically consumes
the code, creates the enquiry/message and a hashed 256-bit chat capability.
The browser remembers the private capability for up to 30 days (never in a URL).
Treat it as a secret; clearing browser storage loses access. Visitors with expired
or lost access can verify their email to start a new enquiry. A lost verification
response may require a new code/enquiry; consumed codes cannot be replayed.

Admin replies live in `/owner` → **School enquiries**, protected by existing
owner authenticator MFA. All enquiries identify their verified email and school.
Visitors reopen the welcome assistant → **Talk to admin** in the same browser
to read/reply. Email replies are **not** imported into chat. Messages persist
even if notifications fail; that failure is shown explicitly. Stable reply IDs
make write retries idempotent. Resolved enquiries reopen when a message is sent.

Public routes are `/support/public/chat`, `/code`, `/verify`, and
`/enquiries/:id` with `/messages` and `/notify`. Enquiry access uses
`Authorization: Enquiry <opaque-token>`, not a student/school login token.
Owner routes are `/owner/support/enquiries`, `/:id`, `/:id/messages` and
`/:id/status`. Threads paginate in 100-message pages; owner lists in 50-row
pages. Open views poll and pause while the browser tab is hidden.

Optional WhatsApp contact: apply `db/migrations/20261111_school_enquiry_whatsapp.sql`
once **after** the base `20261110_school_enquiries.sql` migration, before deploying
the updated backend and website. Do not rerun the base migration on installed tables.
The new migration adds nullable numbers and preserves existing enquiries and RLS.
Visitors select a country code and enter a national number, then separately
consent to WhatsApp contact. Web and backend use `libphonenumber-js/max` metadata
to validate country-specific lengths and numbering patterns, including countries
with variable-length numbers or shared calling codes. The API accepts normalized
international `whatsappNumber` and optional ISO `whatsappCountry`; older clients
can still send an international number without the country field. A stored number
signifies permission. This selector needs no additional database migration.
Email verification remains mandatory; the WhatsApp number itself is not verified.
The admin inbox and notification email show the number and a manual `wa.me` link.
No automatic WhatsApp messages are sent, and WhatsApp replies do not sync to chat.

Rate limits are process-local: 30 bot requests/minute and 5 code requests/10
minutes per socket IP, plus 3 code deliveries/10 minutes per email. Verification
attempts are also enforced atomically in PostgreSQL. Behind a proxy, the socket
IP limit may group visitors; arbitrary forwarded IP headers are not trusted.
For large public campaigns, configure edge abuse protection/distributed limiting.
Operators should periodically purge expired code challenges and define enquiry
retention/deletion procedures. The assistant warns visitors against sharing
passwords or student records and redacts common secret patterns; it is not a
general-purpose sensitive-data scrubber.

Validation: `node -r ts-node/register --test src/support/visitor.test.ts`.
SQL integration: run `scripts/school_enquiries_db_test.ts` with
`ENQUIRY_TEST_DATABASE_URL` set to a disposable localhost PostgreSQL database,
never production.

School student progress
-----------------------

The website's School Admin sidebar includes **Student Progress**. Administrators
can search students across their school, filter by class and view the same full
learning report and exam report cards used in the student and teacher portals.
This is read-only: it does not change marks or record student celebrations.

Authenticated, school-scoped endpoints:

- `GET /school/progress/students` returns the complete minimal roster and classes.
- `GET /school/students/:id/learning-score` uses the shared learning-score service.
- `GET /school/students/:id/report-cards` returns released results and pending exams.

Missing or different-school student identities are denied before report retrieval.
Roster queries read all database pages; report-card rankings also use the complete
class roster. No new tables, migrations or RLS changes are required. Existing
report-card tables must already be installed. Deploy the backend before the website;
the existing CloudFront `school*` behavior covers these routes.

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
