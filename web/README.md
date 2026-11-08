# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Natural Orchard artwork

The student Orchard matches mobile: Mathematics earns acorns, Science apples,
English cherry rewards, Social Studies oranges, Computer pears and Hindi mangoes.
Catalog tree identifiers are preserved; dynamic-subject palettes reuse these
natural themes. A cherry pair is one lesson-mastery reward.

Lemon, peach, plum and coconut complete the ten-design pool. New school subjects
automatically receive unused designs before designs are reused. Assignments are
saved per school by the backend and remain stable when new subjects are added.
Both clients render the returned `treeType`; even subjects sharing a design keep
independent chapter growth and fruit counts. See [backend assignment setup](../backend/README.md).

Seeds, sprouts and young plants have distinct PNGs on transparent 2048 x 2048
canvases. Later growth artwork reuses the supplied oak images. Each fully mastered
Golden Fruit chapter earns one fruit at the measured oak coordinates. Beyond nine,
additional fruit sprites appear in the upper canopy without limiting the count.
Both clients use byte-identical assets and matching positioning calculations.
Completion percentages, rewards, retention requirements and school scoping are unchanged.

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
