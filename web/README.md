# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Illustrated AcademiX branding

`public/logo.png` is the transparent illustrated logo used by login, all portal
headers and report cards. It is byte-identical to the Flutter master at
`mobile/assets/branding/logo.png`. The blue A, graduation cap, book, swoosh, star,
name and tagline are preserved with a matte painted finish.

After replacing the master, run `swift tool/build_launcher_icons.swift` from
`mobile/` on macOS. This updates both clients' logo/icon assets, including
correctly sized web manifest icons, favicon PNG/ICO and the 180px Apple touch icon.
Small icons use only the emblem so the name/tagline do not become unreadable.
Deploy the generated public assets together; the source replacement alone does
not update the production website.

## School registration contact verification

Manual Teacher Registration and Manual Student Registration accept either a
verified mobile number **or a verified email address**. A valid mobile number
must still be entered even when email is verified. Teacher email remains required;
student email is optional if SMS is used.

For SMS, India (+91) is the default; choose another country when needed. Enter
the national number, select **Send SMS code**, enter the six-digit code, then
select **Verify number**. Alternatively, enter an email, select **Send email code**,
enter its six-digit code, then select **Verify email**. Either verification unlocks
registration. Changing one contact clears only its verification, not the other.
Codes expire after ten minutes; resend is available after 60 seconds.
Verification itself lasts ten minutes and is one-use;
after a failed or uncertain registration request, verify again before retrying.
Students must also have a valid date of birth; their email remains optional.
Use a parent/guardian contact for students where appropriate.

Deploy both backend verification migrations and configure Twilio Verify (SMS)
and/or the existing SMTP service (email) as described in
[`backend/README.md`](../backend/README.md#mobile-or-email-verification-for-manual-school-registration)
before deploying this website. There is no test-code bypass for an unconfigured
channel; the other configured channel remains usable. Existing login and invite
registration are unchanged.
Run `CI=true npm test -- --watchAll=false --runInBand src/components/SchoolDashboard.test.jsx`.

### School mobile verification and account editing

Manual Teacher Registration includes an optional **Date of Birth** field.
The saved date is prefilled in **Edit teacher**, where it can be updated.
Future or invalid dates are rejected; leaving it blank during registration
preserves the existing registration behavior.

The private owner **Register a school** form requires both a verified mobile
number and school email. Select a country (India is the default), verify the
mobile by SMS, then send and enter the school email code to create the account.
Changing the number invalidates its verification. The existing owner MFA session
remains separate from the created school's login. Both existing backend SMTP
and Twilio settings must be configured.

In the school portal, use **Edit teacher** or **Edit student** to update mobile,
email, gender and date of birth alongside the existing fields. Each changed
contact must be verified separately before Save; changing one contact does not
clear verification of the other. Unchanged contacts do not require OTP, and
legacy accounts can still edit other details without filling absent contacts.
Dates must be valid and not in the future. Existing contacts cannot be removed.
Save errors are displayed and failed/uncertain saves require fresh verification
for changed contacts.

Before deploying, also apply the approved
`backend/db/migrations/20261117_school_phone_and_profile_fields.sql` migration
described in the backend README. This code does not run production migrations.
Verify both flows with
`CI=true npm test -- --watchAll=false --runInBand src/components/OwnerPortal.test.jsx src/components/SchoolDashboard.test.jsx src/ownerApi.test.js`.

## School, teacher and student forgot password

The School, Teacher and Student login forms include a **Forgot password?** link that
opens `ForgotPasswordPanel`. School admins use their school email as the login
and choose between a code sent to that email or to the school's verified mobile
number. Teachers and students enter their login ID and choose **Email** or
**Mobile number**, with India (+91) selected by default. If the email isn't
valid for the account, the message offers a one-click switch to mobile
verification. After the 6-digit code arrives, users set a new password. A live
checklist shows the rules: at least 8 characters, a letter, a number, a special
character, and different from the current password. On success, the login form
returns with the login ID filled in and a confirmation message. The Flutter app
has the same teacher/student flow in
`mobile/lib/screens/auth/forgot_password_screen.dart`. It has no school login.
Test with
`CI=true npm test -- --watchAll=false src/components/RoleGateway.test.jsx`.

## Multi-lesson curriculum PDF upload

In **Add one lesson manually**, enter the lesson name and either choose PDFs,
paste the lesson's teaching content into **Or paste lesson content**, or use both.
Description remains an optional teacher note, not the teaching content. Pasted
text is saved as a text document and indexed for the lesson's Sam tutor. Up to
200,000 characters are supported; longer pastes stay intact with a visible error
instead of being truncated. Drafts survive save failures; pasted content clears
on success or when switching class/subject to avoid mixing lesson sources.

School > Curriculum Content keeps manual Add Lesson and adds **Upload Multi-Lesson
PDF** for the selected class/subject. Choose one PDF, select **Detect lessons**,
review automatically filled names and first/last source-page links, confirm the
boundaries, then create all lessons. Upload the next part separately: numbering
continues after existing lessons; duplicate titles or a changed curriculum block
publication rather than overwrite anything.

Clear unit/chapter headings or prominent numbered titles and searchable text are
required. Scanned teaching pages need OCR; units sharing a page or uncertain
boundaries require manual uploads. Previews expire after 15 minutes. Each created
lesson has a physically separate PDF and isolated tutor chunks, not a copy of the
whole textbook. Deploy the updated backend and website together.
Run `CI=true npm test -- --watch=false --runInBand --runTestsByPath src/components/SchoolDashboard.test.jsx`.

## Home Sam voice

Home-page Sam has a top-right **Speed** selector with 1x and 2x
playback. It applies immediately to generated audio and is retained while the
Home component remains mounted. Browser speech fallback applies a changed
speed from the next segment if the browser cannot change a spoken utterance.
The speed setting does not affect lesson AI Tutor playback.

After the text reply arrives, speech starts with a short segment (at most 240
characters), with the next segment prepared during playback. Segments play
sequentially; mute, closing, a new question, recording or unmounting invalidates
pending audio so old replies cannot restart. Actual startup time still depends
on the voice service and network; this is not token-streaming chat/audio.
Run `CI=true npm test -- --watch=false --runInBand --runTestsByPath src/components/QuickSamBubble.test.jsx`.

## Homework help with Home Sam

Unsubmitted homework cards, including the latest assignment, have a small raised
**Ask Sam** button at the top right. It navigates to Home and opens the existing
Sam bubble with the selected assignment. Calculations/tasks receive one small
guiding clue; theory receives a memorable concept story and a check question,
not a completed answer. Follow-ups retain the assignment until Sam closes.
Submitted cards do not offer help; scheduled strict exams disable it.
The backend verifies ownership and submission state, reads teacher worksheets,
and preserves the uploaded-class-material teaching boundary. Deploy both the
updated backend and website. No chat conversation IDs or database policies change.
Run the Sam test above plus `src/components/StudentDashboard.performance.test.jsx`.

## Teacher homework autocorrection

Students > Homework Status keeps its submission viewer and Autocorrect action.
The shared backend sends both typed answers and submitted photos, alongside
the teacher's questions/worksheet images, to a vision-capable model. AI returns
a suggested score and corrections for teacher review; Submit is still required
to publish the grade. Missing/unreadable images, AI service failures and invalid
grading responses show errors rather than guessed grades. Deploy the updated
backend for image recognition in both the website and Flutter app.

## Strict mock exams

Teachers can enable **Strict exam** when assigning a scheduled test. The
**Exam monitor** dropdown beside Assigned shows paused students, incident
reasons/counts, individual Resume actions and **Resume all** for paused students
in that exam; it updates every five seconds. At the scheduled closing time
(for example, after a one-hour exam), the monitor and incidents disappear
automatically, including when polling is offline. Saved results are retained.
Only the assigning teacher can resume students. Assigned strict exams are
locked against edits; use Reuse for a new draft.

Students receive a warning before starting. Leaving the test, changing the
page/hash, hiding the tab or blurring the window locks answers for that student,
without pausing anyone else or stopping the server-synchronized countdown. Failed answer saves
retry while access is locked. Reloads and another device cannot clear a server
pause. AI Tutor/Quick Sam are unavailable throughout the active scheduled
window until submission. At schedule end, saved answers are finalized and
Tutor access returns, even if the student was paused.

Install the additive `backend/db/migrations/20261112_strict_mock_exams.sql`
migration first, then deploy the backend and updated web/mobile clients.
Client detection is best-effort: normal browsers cannot prevent switching
tabs/apps, and interruptions are reviewable events, not proof of cheating.
No camera/screen surveillance is used. Network loss can also pause a test.
Run `CI=true npm test -- --watch=false --runInBand --runTestsByPath src/hooks/useStrictExam.test.jsx src/components/StudentDashboard.performance.test.jsx`.

## School administrator account and support

School-admin website support offers direct Call and WhatsApp links in both
Report an issue and Connect to a technician. Other portal roles do not render
these options. WhatsApp opens externally with a generic, editable message and
does not automatically send account details, form contents or chat history.
External conversations are not tracked in Your requests; the existing ticket
form and replies remain available. This is role-specific UI, not a private
contact-number storage mechanism.

The school website sidebar's school name opens an account dropdown on every section:
school name, administrator role, login email, branch and location. School ID and
Logout are not shown in the card; the sidebar footer retains Logout.
It supports keyboard activation, Escape, outside-click and
focus-away dismissal. School login retains branch/location from the existing
authentication response; older saved sessions need a fresh login to populate
those fields. Unavailable details are labelled explicitly. No new endpoint or
database migration is required.

## Loading and refresh performance

Portal dashboards and the owner portal load as separate JavaScript chunks, only
when their role/path is opened. Login/logout hash clearing and the dashboard
layout are unchanged. A failed portal load offers an explicit Reload action.

The student dashboard retains Home summaries but defers Calendar, Library,
learning timeline, tutor lessons and chat until their section is opened.
Profile/settings and the existing daily check-in still initialize once.
Visible panels refresh in the background, reuse recently fetched data on quick
revisits, and skip overlapping scheduled requests. Hidden browser tabs pause
refreshes and refresh stale visible data when returning. Tutor history polls
only while AI Tutor is open. User actions still refresh their affected data.
Errors continue to appear through the existing panel messages.

Student, teacher and school web portals omit manual Refresh buttons. Existing
background updates and post-save reloads remain active; browser reload fetches
fresh data. Failed requests still offer retry controls where available.

Regression checks:
`CI=true npm test -- --watchAll=false --runInBand src/hooks/useVisiblePanels.test.js src/components/StudentDashboard.performance.test.jsx src/App.test.js`.

## Natural Orchard artwork

Orchard retains its overview within the logged-in student dashboard while
refreshing on revisit. Its side panel and expanded view share an in-flight tree
request; an already-loaded selected tree is reused on expansion. Returning from a
tree refreshes both the overview and selected detail so learning/review changes
remain visible. Detail errors offer Retry rather than silently disappearing.

Tree sprites prefer transparent WebP copies (maximum 768 pixels, quality 90),
with original PNG fallbacks. Originals remain unchanged. After replacing artwork,
run `node scripts/optimize-orchard-art.js` from `web/` with `cwebp` installed and
deploy the generated WebP files alongside the website. Current 82 optimized
images total about 2.66 MB versus 67.95 MB of PNG originals; only images used by
rendered trees are requested, so this is not each page's total download size.
Native Flutter keeps the original bundled PNGs but decodes tree/fruit images at
their displayed physical size to reduce image-memory overhead.

Regression checks:
`CI=true npm test -- --watchAll=false --runInBand src/components/StudentOrchard.test.jsx src/components/orchard/TreeSprite.test.jsx`.

The student Orchard matches mobile: Mathematics earns acorns, Science apples,
English cherry rewards, Social Studies oranges, Computer pears and Hindi mangoes.
Catalog tree identifiers are preserved; dynamic-subject palettes reuse these
natural themes. A cherry pair is one lesson-mastery reward.

Lemon, peach, plum and strawberry complete the ten-design pool. New school subjects
automatically receive unused designs before designs are reused. Assignments are
saved per school by the backend and remain stable when new subjects are added.
Both clients render the returned `treeType`; even subjects sharing a design keep
independent chapter growth and fruit counts. See [backend assignment setup](../backend/README.md).
Strawberry uses the `strawberry` tree key and `public/assets/orchard/strawberry/`
folder. Older `coconut` assignments normalize to strawberry and remain supported
as a client alias. No additional migration is needed; existing growth is preserved.

Seeds, sprouts and young plants have distinct PNGs on transparent 2048 x 2048
canvases. Later growth artwork reuses the supplied oak images. Each fully mastered
Golden Fruit chapter earns one fruit at the measured oak coordinates. Beyond nine,
additional fruit sprites appear in the upper canopy without limiting the count.
Both clients use byte-identical assets and matching positioning calculations.
Completion percentages, rewards, retention requirements and school scoping are unchanged.
Returning from an expanded tree refreshes both overview data and selected chapter
details, so completed chapters do not remain displayed as the next unfinished lesson.

Deploy the backend providing `masteredChapters` before the updated clients.
Without this count, no mastery is inferred from ordinary completion.
Apply `backend/db/migrations/20261112_orchard_school_tree_assignments.sql` once
before deploying the backend with stable school assignments; no existing table
or policy is changed. Artwork is in `public/assets/orchard/`; its build script
and source-sheet workflow are documented in [mobile](../mobile/README.md).

## School Student Progress

Open **Student Progress** from the School Admin sidebar (`#progress`). Search by
student name with **All classes** selected to search the whole school, or narrow
the list by class. Student results are paginated locally after the complete
school-scoped roster is retrieved, so search includes students on every page.
**Clear filters** returns to school-wide search.

The selected student sees the same shared `StudentProgress` and embedded
`StudentReportCard` components as the teacher portal: learning score, skill and
subject growth, daily/monthly trends, released exam results and pending subjects.
Learning and exam graphs update every minute while open. Saving the school
calendar immediately reloads the selected reports. Reports are read-only and use
the authenticated `/school/*` APIs; student and teacher flows are unchanged.
The picker stacks above reports on narrow screens. No mobile changes are included.

## Login welcome assistant

The bottom-right headset bubble opens a polished public AcademiX feature guide.
It introduces the personal AI tutor, homework/exam practice, progress graphs,
school branding and custom feature development. Login and invite forms are
unchanged; the assistant does not create accounts or read their credentials.

The public guide prioritizes practical scenarios over generic “app” or “feature”
keywords. Fee payments and Attendance/Transport/Medical Info previews are not
described as live workflows; unverified features are referred to admin rather
than promised. It covers submission mistakes, connectivity, interrupted tests,
learning reports versus school marks, Orchard mastery, lesson visibility, login
access and AI answer limitations. No private accounts or school records are read.
Short follow-ups can use the last four user questions, validated/redacted by the
backend (2,000 characters each); bot replies are excluded and this context is not
persisted. Explicit new topics override previous questions.

Deploy the backend before the website. Regression checks:
`cd backend && node --test -r ts-node/register src/support/visitor-guide.test.ts src/support/visitor.test.ts`
and `cd web && CI=true npm test -- --watchAll=false --runInBand src/components/WelcomeAssistant.test.jsx`.

**Talk to admin** asks for enquiry details and consent, then verifies the
visitor's email before sending the request. Admin receives an email notification
and replies in the MFA owner page's **School enquiries** tab. Visitors receive
reply notifications and can return to the assistant in the same browser.
`AcademiX.enquiry` stores only the enquiry ID and private chat token; access
expires after 30 days. Forgetting browser access does not delete the admin's
saved enquiry. The chat does not import incoming email replies.

Visitors can optionally select a country code and enter a mobile number with explicit
WhatsApp contact permission. Country-specific length and numbering patterns are
validated in the form and backend using `libphonenumber-js/max`, rather than a
single fixed digit count. National leading zeros are handled by the phone metadata.
Email verification is still required. Format validation does not verify ownership
or whether the number is registered on WhatsApp. The admin sees
the number and a manual WhatsApp contact link; numbers are visitor-supplied, not
verified. WhatsApp conversations do not sync into the website chat. This addition
requires the follow-up `20261111_school_enquiry_whatsapp.sql` migration before
deploying the updated backend and website.

The dialog supports Escape, focus restoration, responsive scrolling and reduced
motion. Errors and failed notifications are visible; user-initiated sends show
feedback, while conversations refresh silently in the background.

See the [backend setup](../backend/README.md#public-school-enquiries) before
deployment: one new migration plus configured SMTP are required for admin chat.
No mobile UI changes are included.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
# Learning progress

Progress graphs use the shared `GET /progress/learning-score` history: understanding,
tree growth, tests/mock tests, practice and homework all contribute. Both graph
ranges and the current subject score use the same backend formula. Homework is
included in the subject's score breakdown; no client-side game-only calculation
or migration is needed. Deploy the backend changes to update the calculation.
