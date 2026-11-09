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
growth counts. Tests are graded percentages, linked to their parent assignment
and dated by completion; started/unsubmitted attempts do not count.
Legacy `local-test-*` IDs are resolved from the existing local
assignment feed, never sent to Supabase UUID filters. If their assignment metadata
has disappeared, the backend logs the unresolved references and keeps the original
attempts in overall progress (and subject progress when the attempt itself names
the subject). It does not invent subject assignments or suppress genuine DB errors.
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
accuracy is used when available. Homework blends grades with unique completed
assignments (eight = full completion credit); ungraded submissions earn completion
credit, not a fabricated zero grade. Resubmissions count once.

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
Mirrored test/homework metrics are not treated as practice. Historical test
metrics remain part of the test average after newer real attempts arrive;
same-subject, same-score metrics within 60 seconds of a completed attempt are
excluded as mirrored writes.
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
