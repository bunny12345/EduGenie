# Student, teacher and school support

## Student workflow

1. On the website Home, open School Services > Technical Query.
   In the student mobile app, open Services > Technical Query.
2. Ask the Help Assistant about using AcademiX (homework, Sam, microphone,
   login, tests, navigation, rewards, etc.).
3. Choose **Report an issue** for a problem, or **Connect to a technician** when
   the answer does not solve the problem.
4. Enter a short title and describe the page, what you tried, and what happened.
   Recent student questions are included with the report. Do not share passwords,
   codes, private student records, or secrets.
5. The request is saved and the technician is emailed. Find it under **Your
   requests** to read replies and send follow-up messages.

The bot uses a fixed, public-facing operational guide, not an LLM or application
source code. It cannot retrieve internal configuration, secrets or student records.
Unknown questions explicitly offer human support instead of invented answers.
Normal bot conversations are not persisted; submitted requests and technician
messages are persisted. Common token/key and labelled-password patterns are
redacted server-side, but this is not a guarantee that arbitrary personal text
will be detected: the UI instructs students not to send sensitive information.

## Technician workflow

1. Sign in at `https://academix.now/owner` and complete authenticator MFA.
2. Select **Support Inbox**.
3. Select a ticket, read its requester/account role, school ID, classes and messages.
4. Send a reply. It appears in the requester's support conversation.
5. Use **Mark resolved** when done. A new message reopens the request.

Notifications go to `jpr1521@gmail.com` by default. This is a backend-only
destination, not a client-supplied recipient. You may configure
`SUPPORT_NOTIFICATION_EMAIL` on the backend to override it.

**Reply inside Support Inbox, not Gmail.** Gmail replies are not imported.
Students, teachers and school administrators do not need email addresses to receive replies; they return
to their authenticated request. New requests and requester follow-ups notify the technician.
The system does not promise immediate/live availability.

While open, messages refresh every ten seconds and ticket lists every fifteen
seconds. Lists are paginated; the conversation loads all message pages.
Only the requester who created the request, with the same role and verified school,
can read or send requester messages. The owner inbox requires owner MFA.

## Teacher floating support

On the teacher website Home (the Teacher section) or mobile Teacher Home, tap
the blue floating message icon at the bottom right. It opens **Teacher Support**,
using the same light blue support design, issue form, saved requests and replies
as student support. Closing the panel clears only temporary bot chat.

The teacher guide covers announcements, assigning homework, reviewing submissions,
mock-test authoring, class rosters, AI Assistant navigation, progress, report cards,
login and device permissions. It provides operational guidance only, not academic
answers, internal implementation details, passwords, keys or student records.
Unsupported questions offer **Connect to a technician** rather than invented
answers. The guide has no LLM, source-code access or record lookup.

Teacher identity, role, school and assigned classes are resolved by the backend,
not accepted from the report form. Reports and follow-ups notify the configured
technician email with the **teacher** role. Reply through the same owner inbox.
Teacher and student tickets are kept separate even if account IDs coincide.

## School floating support — website only

On the school website **Overview**, tap the blue message bubble at the bottom
right. The same support panel opens with **School Support**, school-specific
suggestions, **Report an issue**, saved requests and technician replies.
The bubble appears only on Overview. Closing it clears temporary bot chat, not
saved requests.

The curated school guide covers teacher/student registration, private invite
links, teacher class assignments, curriculum PDFs, class filters and school
login. It refuses internal technical information and academic questions, has
no access to private records or secrets, and offers technician escalation for
unsupported questions. Never paste passwords, codes, invite links or records.

The backend verifies the school account against its school row, scopes tickets
by authenticated account, school and `school_admin` role, and labels notifications
and messages as school-administrator requests. School admins cannot read student
or teacher support tickets. The MFA owner inbox can reply to all three roles.
The mobile School Admin placeholder is unchanged.

If bot answers work but saved requests show “Support could not save or retrieve
your request”, check the backend support error log. School identity lookup uses
the existing `schools.school_name` column. A `schools.name` column error requires
deploying the corrected backend, not adding a column or rerunning migrations.

## Deployment

1. Apply `backend/db/migrations/20261106_student_support.sql` once to the same
   Supabase project used by the backend, through the Supabase SQL editor or your
   trusted migration connection. It creates only new support tables, functions,
   indexes and RLS policies. It does not change existing tables or RLS.
   If student support is already installed, do not rerun that migration.
   For teacher support, additionally apply
   `backend/db/migrations/20261108_teacher_support.sql` once. This approved
   extension allows teacher message authors and updates service-only write
   functions to enforce requester role, school and account identity. It preserves
   existing messages and all existing RLS policies. Teacher reads and writes go
   through the authenticated backend; no direct client database access is added.
   Then apply `backend/db/migrations/20261109_school_support.sql` once to enable
   school-administrator message authors and role-checked shared write functions.
   Existing messages and RLS policies are preserved. Do not rerun previously
   applied migrations. Deploy the updated backend and website after applying it.
2. Ensure backend `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.
   Support ticket writes deliberately have no local mock fallback.
3. Ensure the existing SMTP variables are working:
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (and
   `SMTP_SECURE` where required).
4. Keep `OWNER_SUPABASE_USER_ID` configured for owner MFA authorization.
5. Deploy the backend, then rebuild/deploy the website.
   For AWS hosting, apply the CloudFront configuration in `infra/aws/` so
   `support*` and `owner/support*` route to the backend origin. Without those
   behaviors, support requests reach the website's S3 origin instead of NestJS.
6. Test with a real intended student account: send one clearly labelled test
   report, confirm its email arrives, reply in the owner inbox, and check the
   student's reply view.

No real reports/emails or production migrations are performed by the tests.
The mobile School Admin placeholder is unchanged. Public support endpoints accept
student, teacher and school-admin roles only. Requesters cannot forge account identity,
technician messages, or notification recipients through request bodies.

## Mobile and website sync

The student and teacher apps use the same authenticated `/support/*` endpoints and
Supabase tables as the website. Sign in to the same account and role to see the same
requests, status and technician replies on both platforms. The owner continues
replying through the website's MFA-protected Support Inbox. Bot replies and
suggestions come from the same backend guide; normal bot chat is temporary and
is not synced. Only submitted requests and follow-ups persist.

Tap a mobile request to open it; tap the selected request again to close it and
return to the Help Assistant. Closing does not delete the saved conversation.

The app refreshes requests every fifteen seconds and an open conversation every
ten seconds. Refresh manually or pull down to check sooner. Polling pauses while
the app is backgrounded, and refreshes on resume. Failed submissions keep the
draft and retry ID; notification failures show an explicit warning with retry.

The app defaults to `https://academix.now`, matching the live website backend.
Local web development currently uses `http://localhost:3000`; to test the app
against that backend, pass `--dart-define=API_BASE_URL=http://localhost:3000`
when running Flutter. Both clients must use the same backend for data parity.
The student mobile addition needs no additional migration. The teacher addition
requires the teacher-support migration and a backend and website deployment.
Rebuild/relaunch the app to use the new teacher floating button and support screen.

If email delivery fails, the request remains saved and the UI explicitly warns
that email was not delivered, with a retry-notification button. Missing database
setup is an explicit error, never a fake success.

Create and message IDs make retries safe from duplicate ticket/message storage.
There are per-account bot, reporting, messaging and notification limits on the
current single-instance backend. A multi-instance deployment should replace
these process-local rate limits with shared infrastructure before scaling.

## Verification

```bash
cd backend
npx tsc --noEmit
node --test -r ts-node/register src/support/support.test.ts src/auth/owner-auth.test.ts

cd ../web
CI=true npm test -- --watchAll=false --runInBand src/components/TechnicalSupport.test.jsx src/components/OwnerPortal.test.jsx src/supportApi.test.js
npx eslint src/components/TechnicalSupport.jsx src/components/TechnicalSupport.test.jsx src/components/OwnerPortal.jsx src/api.js src/supportApi.test.js
CI=false npm run build

cd ../mobile
flutter analyze
flutter test test/support_api_service_test.dart test/student_support_screen_test.dart
```

The SQL integration test uses `backend/scripts/support_db_test.ts`.
It requires `SUPPORT_TEST_DATABASE_URL` pointing to an **empty disposable local**
PostgreSQL database, owned by a role that can create test roles and schemas.
Never point it at production. Run from `backend/` with `npx ts-node
scripts/support_db_test.ts`. It verifies atomic creation, idempotency, reopen,
student/school RLS isolation, teacher role/account/school write isolation and
service-only access, school-admin identity isolation and preservation of existing
student/teacher messages. It applies all three support migrations to the disposable database.
