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
**Refresh** reloads the roster and both reports. Reports are read-only and use
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
