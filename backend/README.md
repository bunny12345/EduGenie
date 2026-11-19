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

### Mobile or email verification for manual school registration

The school's manual teacher/student registration accepts **either verified SMS
or verified email**, not necessarily both. A valid mobile number must still be
entered even when email is used for verification. India (+91) is selected
initially; other countries are available. Mobile numbers are validated with
`libphonenumber-js` and saved in international E.164 format.
Student date of birth is required, must be a real date and cannot be in the future;
teacher email remains required, and student email is optional when using SMS.
Teacher registration also accepts optional `dateOfBirth` (`YYYY-MM-DD`); when
provided it must be a real, nonfuture date. It is saved in `teachers.date_of_birth`
and the local account fallback, and returned for the existing teacher edit form.
This uses the column in `20261117_school_phone_and_profile_fields.sql`; no
additional migration is required.
A parent/guardian contact may be used for students. Each registration requires
a new verification proof.

Before deploying the updated backend and website:

1. Apply `db/migrations/20261116_registration_phone_verification.sql`. It adds
   the approved nullable `teachers.phone` column and a new service-role-only
   `registration_phone_verifications` table. Existing rows and RLS policies are
   not changed. Also apply `db/migrations/20261116_registration_email_verification.sql`
   to create the new service-role-only email verification table. It does not
   alter any existing tables or policies. No migration is run automatically.
2. For SMS, configure backend-only `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and
   `TWILIO_VERIFY_SERVICE_SID` using your deployment secret manager. Create an
   SMS-enabled Twilio Verify service with six-digit codes and the default
   ten-minute validity. Enable the required destination countries and complete
   Twilio's sender/regulatory setup (including India requirements). Trial accounts
   may send only to approved recipients. Never put these credentials in web/mobile.
   The names beginning `AC_your_...`, `VA_your_...` and `your_actual_auth_token`
   shown in setup examples are placeholders, not usable credentials. Set actual
   values in the deployed backend's environment/secrets dashboard as well as local
   development configuration; editing a local environment file alone does not
   update hosting-provider secrets. Restart/redeploy the backend after changes.
3. Configure Twilio Fraud Guard and account/service sending limits before enabling
   real traffic. Backend resend/actor/number rate limits are process-local;
   Twilio's controls must also cover aggregate traffic across backend replicas.
4. For email, configure the existing SMTP mail service on the backend:

   ```env
   SMTP_HOST=your_smtp_host
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_smtp_username
   SMTP_PASS=your_smtp_password_or_app_password
   SMTP_FROM=AcademiX <your_verified_sender@example.com>
   ```

   Use the sending provider's required settings (port 465 uses TLS). For Gmail,
   use `smtp.gmail.com`, your Gmail address and an App Password if supported
   by your account, not your normal Google password. Respect provider sending
   quotas. Restart/redeploy the backend after changing settings. Never commit
   credentials or place SMTP settings in React/mobile. Email verification uses
   the same `EmailService` as school registration; no new mail dependency is
   required. Email-only verification does not call Twilio, and SMS verification
   does not require SMTP configuration.

School-admin-only endpoints:

- `POST /school/registration/phone/request`: `{role: "teacher" | "student",
  country: "IN", phone}` -> `{success, challengeId, expiresAt, resendAfter}`.
  `country` defaults to `IN`; phone may be national or international.
- `POST /school/registration/phone/verify`: same phone/country/role plus
  `{challengeId, code}` -> `{success, verificationId, phone, expiresAt}`.
- `POST /school/registration/email/request`: `{role, email}` ->
  `{success, challengeId, expiresAt, resendAfter}`.
- `POST /school/registration/email/verify`: `{role, email, challengeId, code}` ->
  `{success, verificationId, email, expiresAt}`. Email addresses are normalized
  by trimming and lowercasing.
- Both `/school/teachers/register` and `/school/students/register` now require
  `{phone, country}` and either `phoneVerificationId` or `emailVerificationId`
  alongside their existing payloads. An email proof must match the submitted
  email address. The UI sends only the selected, currently valid proof (email
  takes precedence if both contacts are verified). Student registration also
  requires `dateOfBirth` (`YYYY-MM-DD`).

Codes have at most five checks and a 60-second resend cooldown. Resending SMS
does not reset code expiry or attempt count. Email resends create a new challenge
and code; each challenge expires independently. Only a keyed hash of an email OTP
is stored, never its plaintext code. An approved proof expires after
ten minutes and is atomically consumed before registration; it is bound to the
school, admin, role and contact (plus country for SMS). Proofs survive backend
restarts and cannot be reused concurrently across replicas. Email code hashes
use the existing backend JWT signing secret; rotating it invalidates pending
email codes. Changing a contact clears only that contact's verification; a valid
proof for the other contact can still authorize registration.
A failed/uncertain account-creation request requires
verifying again before retrying. Expired verification rows can be removed by
periodic maintenance (`DELETE FROM public.registration_phone_verifications
WHERE expires_at < now()` and the equivalent for
`public.registration_email_verifications`); they cannot authorize registration.
Email request limits are process-local as well; enforce aggregate mail quotas
at the SMTP provider when deploying multiple backend replicas.

Missing configuration, delivery errors and storage failures are explicit and
never treated as successful verification. There is no fake SMS/email OTP bypass,
including in local mock-database mode. Existing login, invite-link registration
and teacher-managed legacy registration are unchanged; these requirements apply
to the school's two manual registration endpoints/forms. The mobile school-admin
placeholder remains unchanged.

Validate without SMS/email/database access:
`node --test -r ts-node/register/transpile-only src/auth/registration-phone.test.ts`
and `npx tsc --noEmit`. Tests mock all provider and storage operations; real
delivery still needs deployment configuration and live recipient checks.

### School mobile registration and verified profile editing

Apply `db/migrations/20261117_school_phone_and_profile_fields.sql` before deploying
these changes (after the existing contact-verification migrations). It adds the
approved nullable `schools.phone`, `teachers.date_of_birth`, and gender columns on
`teachers`, `students`, and `student_accounts`. It also creates a separate
service-role-only `school_registration_phone_verifications` table. Existing rows
and RLS policies are unchanged. No production migration is run automatically.

Owner school registration now requires **both email and SMS verification**.
India is the default country; other countries are supported. All school
registration endpoints still require the configured owner with TOTP MFA:

- `POST /auth/school/register/phone/request`: `{country, phone}`.
- `POST /auth/school/register/phone/verify`: `{country, phone, challengeId, code}`.
- `POST /auth/school/register/request-otp`: existing school details plus
  `{country, phone}`; sends the school email code and binds the pending details
  and mobile number to the authenticated owner.
- `POST /auth/school/register/verify-otp`: `{email, otp, phoneVerificationId}`;
  consumes the matching owner's one-use SMS proof before creating the school.
  The unchecked `/auth/school/register` endpoint now rejects requests and directs
  callers to this verified flow; it cannot bypass either verification.

The existing SMTP and Twilio settings are reused; both must be configured for
school registration. School email OTPs retain the existing in-process storage:
request a new email code after a backend restart, and route both email steps to
the same replica. If creation fails after verification starts, request a new
email code; if the SMS proof was consumed or expired, verify the number again.
Existing school login and teacher/student registration's either-channel rule
remain unchanged.

School admins can edit phone, email, gender and date of birth through the
existing teacher/student PATCH endpoints. Each **changed** contact requires its
own new OTP; unchanged contacts and personal-only edits do not need OTP. Include
`accountId` in the existing `/school/registration/{phone|email}/{request|verify}`
requests when editing. These proofs are bound to school, acting admin, role,
specific account and contact, and cannot authorize registration or another
account's edit. Send changed `phone`/`country`/`phoneVerificationId` and/or
`email`/`emailVerificationId` in the PATCH payload. Contact removal is rejected.
Omitted profile fields retain their existing values, including for legacy
accounts with no contact or DOB. DOB changes must be real, nonfuture ISO dates.
Gender supports `male`, `female`, `other`, or an empty unspecified value.
Updates preserve login credentials, teacher subject/grade rules and student
class reassignment; student profile updates are mirrored to both student tables.

Edit-form data is resolved field by field: saved roster details take precedence,
missing student fields are filled from the same school's `student_accounts` row,
and remaining gaps use the persisted local registration account. Teacher rows
also retain local registration fields when the database row is incomplete.
The same resolution is used for contact-change checks so unchanged recovered
contacts do not require OTP. No schema change or automatic data rewrite is
needed for this read-path repair. Details absent from every saved source cannot
be reconstructed.

### Teacher, student and school forgot password

Public endpoints (no auth guard) let a school admin, teacher or student reset
their own password:

- `POST /auth/password/forgot/request` with
  `{ role: 'school' | 'teacher' | 'student', loginId, channel: 'email' | 'phone', email? , country?, phone? }`.
  For `school`, `loginId` is the school login email. The email channel uses
  that address, and the phone channel uses the verified school mobile number
  (`schools.phone`).
  The entered email or mobile number must match a contact registered on that
  account. The response contains `challengeId` and a masked `destination`.
  Email codes are sent by SMTP and SMS codes by Twilio Verify, using the same
  configuration as registration verification.
- `POST /auth/password/forgot/reset` with
  `{ role, loginId, challengeId, code, newPassword, confirmPassword }`.

If the email does not match or no real email is registered (teacher alias
addresses such as `name+<loginId>@domain` or `<loginId>@teachers.local` are not
accepted), the error tells the user to verify with the registered mobile number
instead, and vice versa. The new password must be 8–128 characters and include
a letter, a number and a special character. It must also differ from the
current password. Password checks run before the code is checked, so a rejected
password does not use up a code attempt. Codes expire after 10 minutes and allow
5 attempts. Requests are rate-limited per client IP, account and contact.
Challenges are held in memory, so a backend restart requires a new code. The
existing teacher/student reset routines update both the database and local
login stores. School resets update `schools.password_salt`/`password_hash` and
the cached school login. They report an error, rather than falsely succeeding,
if Supabase is configured but the update fails. No schema change is required. Errors return
`{ success: false, error }` with the HTTP status.

### Mock test answer options

When teachers add a question (`POST /tests/:testId/questions`), the backend
shuffles its options and saves the remapped correct-answer index together with
them. Web and mobile therefore use the same saved order for teacher review,
student attempts and grading. Reopening or resuming a test does not reshuffle
options. Existing questions and explicit teacher edits keep their saved order;
no migration or client update is needed.

### Optional strict mock exams

Install `db/migrations/20261112_strict_mock_exams.sql` before deploying this
backend, then deploy the updated web/mobile clients. It creates two new
service-role-only tables with RLS enabled; existing tables and policies are
unchanged. No migration or production deployment is performed by tests.
The file-backed development database remains supported.

Teachers opt in with `strictMode: true` on `POST /tests/:testId/assign`, alongside
the required `startAt`/`endAt`. Existing assignments remain non-strict.
Assigned strict exams cannot be edited or rescheduled (Reuse creates a draft);
deletion is blocked until the schedule ends and results have finalized.

- `GET /tests/exam-access/current`: authenticated student's `{success, exams}`
  restrictions, scoped to their school/class. AI Tutor, Quick Sam, voice and
  game assistance are blocked server-side from scheduled start until submission
  or schedule end, including before opening the test. HTTP 423 represents an
  exam lock, not expired authentication. Student profile and support stay usable.
- Start/submit requests include `clientId`. Strict start restores the one
  authoritative session and answers rather than reopening an unpaused attempt.
- `POST /tests/attempts/:id/control`: `{clientId, action}` with `heartbeat`,
  `save` (+ `{answers: {questionId: optionIndex}}`), or `pause` (+ `reason`).
  Response: `{success, control, result}`; control includes status, revision,
  saved answers, deadline, server time and incident summary.
- Clients heartbeat every 5 seconds. An interruption pauses that student only.
  A 25-second heartbeat gap or another device also pauses the session when
  checked. Server-side compare-and-swap prevents races between saves, pauses,
  resumes and closing. Paused answers/submissions cannot bypass the lock.
- `GET /tests/:id/exam-students`, individual
  `POST /tests/:id/exam-students/:studentId/resume`, and bulk
  `POST /tests/:id/exam-students/resume-all` require the assigning teacher
  in the same school. Bulk resume returns `{success, resumedCount}` and only
  resumes paused students in that exam; active/closed sessions stay unchanged.
  Resuming never extends the original deadline.
- The monitor response includes `ended`, `endAt`, `serverNow` and `students`.
  At the scheduled end it returns an empty student list and `ended: true`;
  web/mobile also hide the monitor and its incidents using server-relative time,
  even if polling loses connection. Saved sessions, answers and results are
  retained; hiding the incident panel does not delete database records.
- At the deadline, only server-saved answers count. A 15-second sweep finalizes
  expired attempts even if both clients are closed, retries failed writes and
  recovers after backend restart. Client/teacher polling also finalizes them.

This is interruption monitoring, not OS-level lockdown or proof of cheating.
Network failures, system dialogs, calls and notification overlays can produce
incidents. Browsers/normal apps cannot prevent all app switches, external
devices, modified clients or screenshots. No camera, microphone surveillance,
clipboard contents or screen recordings are collected.

Validate with `npx tsc --noEmit` and
`node --test -r ts-node/register src/exams/exam-control.test.ts src/progress/learning-score.service.test.ts src/auth/security.test.ts`.

### Teacher account profile

The authenticated `GET /teacher/profile` response retains its existing envelope
and includes `gender`, `loginId` and normalized assigned `grades` for the mobile
profile dropdown. Grades use `resolveTeacherGrades`, including its local-account
fallback, rather than deriving assignments from student enrolment. Missing
gender/login ID are null; no password fields are returned. Existing database
schemas, RLS and account fallback behaviour are unchanged.

Validate without database access using
`node -r ts-node/register/transpile-only scripts/teacher_profile_test.js`
and `npx tsc --noEmit`.

### Teacher homework autocorrection

`POST /teacher/homework/:hwId/ai-grade` reads the latest submitted text/images
and the assignment's questions/worksheet images. The shared LLM service sends
multimodal OpenAI messages with image MIME types; configured Ollama vision
models remain supported. A working real model is required for grading:
ordinary chat retains its fallback, but autocorrection never accepts a mock or
service-error response as a grade.

The response remains `{success, score, feedback}` on success or
`{success: false, error}` when images cannot load, handwriting/context is
unreadable, or the model fails to provide a valid 0-100 score and feedback.
All submitted pages (up to the existing six-image client limit) are included.
Teacher assignment image caches refresh when notes or URLs change.
Autocorrect is review-only; the existing grade endpoint publishes the teacher's
confirmed score. No schema/RLS change is needed. Deploy this backend for both
the website and app to gain image-based correction.

Validate with `npx tsc --noEmit` and
`node -r ts-node/register/transpile-only scripts/homework_ai_grading_test.js`.
Fixtures intercept all model/image networking; they verify payloads and
failure handling, not live model handwriting-recognition accuracy.

### Pasted curriculum lesson content

School-admin-only `POST /curriculum/lessons/:lessonId/content` accepts
`{content}` for a lesson belonging to the authenticated school. The manual school
curriculum form can use pasted text without a PDF, or text alongside its PDFs.
Content must be nonempty and at most 200,000 characters. Original Unicode text is
stored as a UTF-8 `.txt` document; the existing chunk/embedding pipeline indexes
it under that lesson only. No PDF parser or model segmentation is needed.
Indexing errors return `success:false`; the web form removes its newly created
lesson and retains the draft on failure, reporting any cleanup failure explicitly.
Normal document/lesson APIs serve the result to existing web/mobile clients.
No schema or RLS changes are needed. Validate with the curriculum fixtures below.

### Multi-lesson curriculum PDF import

School-admin-only `POST /curriculum/pdf-import/preview` accepts `{teacherId,
subject, className, fileName, data}`. The authenticated school determines scope;
the teacher must teach that subject/class. It returns a private 15-minute preview
with detected lesson names, source page ranges, continuation numbers and excluded
pages. `POST /curriculum/pdf-import/publish` accepts `{previewId, confirmed:true}`.
Source boundaries cannot be changed by the client; publish is idempotent.

The new workflow uses modern PDF.js (Node >=22.13 required; Docker uses Node 22)
without upgrading the legacy manual-upload parser. It preserves physical blank
pages, identifies top-level unit/chapter/numbered headings, checks every page's
headers for missed units with a real model, validates boundary excerpts and
source-anchored titles, then verifies each physically split PDF against its source
pages. Covers/contents and recognized end-matter are explicitly excluded.
An admin must also review the preview: model checks are not a guarantee of perfect
semantic segmentation. Unclear/shared-page boundaries or scanned teaching pages
fail safely; OCR/manual uploads remain necessary for those documents.

Limits: 15 MB, 400 pages, 50 units; eight active previews per backend process.
Previews are in memory, so a restart/different worker requires re-analysis.
All embeddings/documents are prepared before publication; only newly generated
lesson IDs/files are rolled back on failure, without resequencing older lessons.
Existing records are fingerprinted to reject concurrent changes, and scoped
in-process publication blocks conflicting curriculum edits. Visibility is
published in one batch only after all unit documents/chunks have been saved.
Normal lesson/document/visibility APIs serve the web/mobile clients unchanged.
No schema or RLS changes are required.

Run `npx tsc --noEmit` and
`node -r ts-node/register/transpile-only scripts/curriculum_pdf_import_test.js`.
Tests generate actual PDFs and check page/content isolation, continuation,
app API compatibility, scope, duplicate/uncertain units, rollback and idempotency.
Model responses are fixture-controlled; live accuracy requires representative
school PDFs and administrator review.

### Homework help in Home Sam

`POST /chat/quick` accepts an optional `homeworkId` alongside the existing
message/history payload. The server loads the student's own assignment and
checks current submission attempts on every turn; it rejects inaccessible or
already-submitted work. Local-feed fallback remains supported. Teacher worksheet
images (up to six) are included; partial image-loading failures are explicit.

Homework help always stays hint-only: calculations/tasks get one small guiding
clue; conceptual tasks get a short memorable story and a check question, never
a ready-to-submit answer. Follow-up history cannot override these system rules.
Facts/formulas still come only from the assigned subject's uploaded class
materials; missing materials do not unlock general-knowledge answers. This mode
requires a real model and surfaces model failures, rather than accepting mock
responses. Existing `/chat/quick` authentication and scheduled-exam tutor locks
apply unchanged. No schema/RLS change is needed; deploy this backend with the
updated clients.

Run `npx tsc --noEmit` and
`node -r ts-node/register/transpile-only scripts/homework_sam_help_test.js`.
Fixtures verify request scoping, prompt rules, submission rejection, worksheets
and exam guards without live networking; they do not measure real-model pedagogy.

### Class attendance

Apply [the attendance migration](db/migrations/20261119_class_attendance.sql) in
Supabase before deploying attendance. It adds a service-role-only table and
does not modify existing tables or policies. Teachers share one daily register
per assigned class. Both attendance endpoints reuse the school's Progress Graph
dates; roll-call dates follow the graph's Asia/Kolkata calendar. Students only
see their own attendance. The percentage is present days divided by days with
a saved mark for that student; unrecorded days do not count.

### Schoolwork updates in Sam

Home Sam answers questions such as “What homework is due today?”, “Did I
submit my Science homework?”, “How did I do on my mock tests?” and “How is my
progress graph looking?” directly from the signed-in student's records. “Today”
uses the configured school-day default (`PUSH_DEFAULT_TIMEZONE`). The Learning
Power trend comes from the same calculation as the Progress page. Unit Tutor
shows homework linked to the selected Unit and redirects other work or
account-wide results to the relevant Unit or Home Sam.

Status replies are formatted by the backend without model generation or
worksheet OCR. Homework help still goes through the existing answer review.

### Assigned-homework answer protection in both Sam chats

AI Tutor (`POST /chat`) and ordinary Home Sam (`POST /chat/quick`, even without an
Ask Sam button/homework ID) now verify draft replies against locked assignments.
The review includes image questions, paraphrases, short follow-ups and prior
conversation context. Tutor follow-ups retain the previous worksheet images.
Definitions/formulas/constants can themselves be the requested answer: describing
an angle sum as "half a turn" or demonstrating the same constant with another
triangle is not an acceptable hint.

Only small first-step/concept hints are allowed for calculation/practical tasks.
Theory help uses a memorable story about one underlying idea, not a finished
paragraph or a complete answer disguised as a story. A flagged draft is discarded,
rewritten with the concept-only prompt and reviewed again. A second unsafe draft
is withheld with an explicit homework-help boundary and a starter question.
Reviews request JSON mode from OpenAI/Ollama and retry malformed review output
once. Persistently invalid/unavailable reviews fail explicitly; unchecked answers
are never returned on that path. Tutor errors use the existing
`{success:false,error}` envelope rather than an uncaught generic HTTP 500.
Only the approved reply is used for chat persistence and voice.

Submission lookups are scoped by student ID, not an `IN` filter containing local
homework IDs (which may be invalid for Supabase UUID columns).
Assignment/submission reads are fresh rather than cached, and no longer select
only the latest 6/20 entries. Successful teacher-worksheet transcription is cached
by assignment and attachment URLs; transcription failures are not cached as empty
questions. Local-feed assignments still merge with DB rows. A failed guard lookup
blocks ordinary chat; explicit Homework Help can keep using its independently
verified assignment/submission context. The existing one-hour post-submission
lock, lesson/source boundaries, conversation IDs and scheduled-exam guard remain.
Reviews add model calls only when locked homework exists; this can increase reply
latency. Both web and mobile use the same backend protection without client changes.

Validate with `npx tsc --noEmit`,
`node -r ts-node/register/transpile-only scripts/homework_sam_help_test.js` and
`node --test -r ts-node/register/transpile-only src/chat/chat.performance.test.ts`.
Fixtures inject unsafe drafts and test image/follow-up blocking, story rewrites,
fresh/all-assignment lookup, review failures and persistence. They do not prove
perfect semantic detection by the deployed model; live school examples still
need checking after backend deployment.

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

### School-controlled graph dates

School administrators can set **Start date** and **End date** in the learning
calendar panel at the top of **Student Progress** in the school website.
`GET /school/progress/period` reads the saved range and
`PATCH /school/progress/period` saves `{startDate, endDate}` as `YYYY-MM-DD`.
Both endpoints require a verified school administrator; the school ID always
comes from the token, never the request body. Teachers/students cannot edit it.

Apply `db/migrations/20261112_school_progress_periods.sql` **before deploying
the updated backend**. This creates a new, service-role-only table with RLS
enabled, without altering existing tables or policies. No period is seeded.
The existing mock database persists this setting through its normal local store.
Read/write failures are explicit errors, not an unsaved success or silent default.

The range covers at most 24 calendar months and uses inclusive **India time
(Asia/Kolkata, UTC+05:30)** date boundaries. It applies to every student's overall
and subject daily/monthly histories in student, teacher and school reports,
including web/mobile subject detail charts. Partial first/last months use the
exact selected dates. Daily histories cover the complete selected period; long
histories reduce axis-label density, not the underlying points. Future points
are null rather than predicted scores. Without a saved range the previous
account-creation/April timeline remains unchanged.

As confirmed by the product requirement, these are **cumulative snapshots up to
each displayed date**: earlier learning is included, not reset at the start.
The current headline score, weights, momentum and exam-report journey do not
change. Past ranges show past snapshots even if the current headline is higher
or lower. Responses expose `graphPeriod` plus dynamic `trackingSince`,
`academicEndAt` and `academicEndLabel`. Saving refreshes the selected school
report immediately; open progress reports check for updates every minute, and
manual refresh also picks up changes. Only the school portal renders controls.

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

Exam Results Journey
--------------------

The Progress page has one **Exam Results Journey** panel below **Each subject on
its own**, on web and mobile. It uses released report cards, not mock tests or
activity scores. Student, teacher and web school-admin progress views use their
existing identity-scoped report-card endpoints. Incomplete exams never become
graph points; a newly completed report appears on the next 60-second refresh
(or manual Progress refresh on the student screen).

Each exam contributes one point: total subject marks / total possible marks ×
100. A subject filter instead plots that subject's marks / maximum × 100.
This compares 25-, 50- and 100-mark exams fairly, and uses weighted totals rather
than averaging percentages when maximum marks differ. A true zero is plotted;
a subject absent from an exam is a gap, never a zero or an interpolated result.
Invalid marks show an explicit error. The panel does not modify Learning Power
or the homework/mock-test formulas.

The additive `createdAt` report-card response field comes from the existing
exam's `created_at`; no schema changes are required. Points run in exam creation
order, not the most recently edited/released-mark order. Legacy responses without
creation dates use the existing newest-first API order reversed. Changes to
marks replace the same exam point, and new exams extend the line. Trend badges
compare the latest two exams and first-to-latest, in **percentage points (pp)**.
One exam establishes a baseline without inventing a trend. Selecting an exam
shows its original subject marks, percentage bars and changes from the preceding
exam. Charts scroll horizontally for longer histories and support keyboard
selection on web.

Regression commands:
- Web: `CI=true npm test -- --watchAll=false --runInBand src/components/ExamResultsJourney.test.jsx`
- Mobile: `flutter test --no-pub test/exam_results_journey_test.dart`
- Backend release/scoping: `node --test -r ts-node/register src/controllers/school-progress.test.ts`

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

### Student push notifications (mobile app)

Students using the Flutter app get real phone notifications through Firebase
Cloud Messaging (no SMS or email):

- **6:30 PM study plan:** pending homework count, what's due today or overdue, or a revision idea with Sam when nothing is assigned.
- **6:30 PM test reminder:** sent when a mock test opens or closes tomorrow.
- **9:00 PM recap:** that day's real activity on app or web (homework submitted, tests attempted, Sam chats, orchard, check-ins, progress), with praise and the streak, or a gentle nudge.
- **Instant pushes:** sent when a teacher assigns homework, first assigns a test, or posts an announcement. A future-scheduled test notifies the current class roster immediately if students have mock-test notifications enabled. Future-scheduled announcements are skipped.

Times use each phone's own timezone, and each type is sent at most once per
day per device. The scheduler runs inside the backend every minute. It catches
up until 21:00 for the plan and 23:00 for the recap after a restart.

Setup:

1. Run `db/migrations/20261118_student_push_devices.sql` in Supabase. It creates one new table and doesn't change any existing ones.
2. In Firebase console › Project settings › Service accounts, generate a private key. Set it on the backend as `FIREBASE_SERVICE_ACCOUNT_JSON` (raw JSON or base64). Alternatively, set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`.
3. Optional settings:
   - `PUSH_DEFAULT_TIMEZONE` (default `Asia/Kolkata`).
   - `PUSH_SCHEDULER_DISABLED=true` to pause the scheduler, for example on extra replicas.

On AWS, deploy the backend and apply the CloudFront `notifications/*` behavior
from [`infra/aws`](../infra/aws). Without that behavior, `academix.now` can
return the React website instead of the API. After CloudFront finishes deploying,
`curl -i https://academix.now/notifications/preview` without a session should
return HTTP 401 with JSON, not HTTP 200 with HTML. Then sign in on the Android
phone and use **More → Notifications → Reconnect** if permission is already
allowed. Send a test notification before assigning new homework.

Without Firebase credentials, everything except sending still works: device
registration, preferences and previews.

Student-only endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/notifications/devices` | Register or refresh this phone's token |
| `POST` | `/notifications/devices/remove` | Remove this phone's token (sent on logout) |
| `GET` | `/notifications/preferences` | Get the reminder toggles |
| `PATCH` | `/notifications/preferences` | Update the reminder toggles |
| `GET` | `/notifications/preview` | Get today's personalised messages and summary |
| `POST` | `/notifications/test` | Send a test push to this student's phones |
