# AcademiX mobile

The native app supports **Student and Teacher only**. School administrators use
the website; there is no mobile school portal. Restored school/unsupported-role
sessions show a web-only/unsupported notice and can sign out, never fall through
to the student portal. Web school administration and existing API/session
contracts remain unchanged.

## Optional strict mock exams

Teachers can enable Strict exam before assigning a scheduled mock test. Their
assigned-test Exam monitor shows student statuses and interruption summaries,
with individual Resume and **Resume all** actions available only to the
assigning teacher. Bulk resume affects paused students in that exam only and
never changes the deadline. The monitor and incidents disappear automatically
at the scheduled end, even offline; saved results and sessions are retained.
Updates are polled every five seconds and support both themes.

Exam client IDs use a literal random bound, not `1 << 32`: Dart's JavaScript
bitwise shift makes that expression zero and prevents the student API service
from initializing. Verify browser startup and ID stability with
`flutter test --no-pub --platform chrome test/student_api_service_test.dart`.

Students confirm the rules before starting. Moving the app out of the active
foreground (including system interruptions) or attempting Back pauses only
that student's answers. Failed connection/save checks lock input while
retrying; a server heartbeat gap longer than 25 seconds also requires teacher
review. Returning/reopening does not lift a persisted pause. The timer never
stops, and the original schedule is never extended. At schedule end only
server-saved answers are finalized, whether active or paused.

AI Tutor and Quick Sam show an exam restriction during the scheduled strict
window, even before starting, until submission or schedule end. Ongoing Sam
sessions, voice playback and microphone capture are stopped when access locks.
Backend guards
also block tutor/voice/game assistance endpoints. These features require the
updated backend and additive `20261112_strict_mock_exams.sql` migration.

This is best-effort interruption monitoring, not device kiosk mode or proof of
cheating. Normal apps cannot prevent all app switches, screenshots or external
devices. Network loss, calls and system overlays may also cause pauses; no
camera, screen recording or clipboard surveillance is introduced.
Run `flutter test --no-pub test/strict_exam_test.dart test/quick_sam_bubble_test.dart test/tasks_games_dark_test.dart test/teacher_theme_test.dart`
and `flutter analyze --no-pub`. Native device verification is still required
before a school rollout; this development machine has no Android/Xcode target.

## Student Homework and Mock Tests

The Homework screen has a persistent, raised **Homework / Mock Tests** switch.
Both views keep the selected subject; homework drafts, filters and expanded
instructions/feedback survive switching views. Subject badges count actionable
items in the selected view, using the existing due/submission/test-window rules.
The compact subject heading is separate from individual assignment cards.
Raised, labelled actions distinguish instructions, saved submissions, history,
feedback and the primary Submit button; static titles/statuses are not buttons.
An explicit All filter resets the existing status filters. Light/dark surfaces,
small screens and large text are covered by
`flutter test --no-pub test/homework_layout_test.dart test/tasks_games_dark_test.dart`.
Submission, uploads, the resubmission window, test start/review and strict-exam
controls use their existing services and rules. No backend/schema change.

Teacher Assigned Homework History thumbnails open the same full-screen viewer
as student subject homework history and saved submissions. Tap any image to
open it, swipe or use the arrows between images, and pinch to zoom. Download
image saves the current photo; Download all saves the attachment group. Native
builds request Photos access and save to the AcademiX album; browser builds
download files (the browser may ask permission for multiple downloads).
Failures and denied photo access are reported explicitly. Relative attachment
paths resolve against the configured backend in both portals.
Run `flutter test --no-pub test/homework_attachments_test.dart` and
`flutter test --no-pub --platform chrome test/homework_attachments_test.dart test/save_attachment_web_test.dart`
for history viewing, navigation, download handling and browser file creation.

## Home Sam voice

The top-right Home Sam speed menu offers 1x and 2x. It updates current
and subsequent playback without regenerating the voice, and is retained when
Sam is closed/reopened within the app session. Lesson AI Tutor speed is unchanged.
After a chat reply arrives, a short opening segment (at most 240 characters)
is synthesized first; subsequent segments are prefetched one at a time and
played sequentially. Mute, close, new questions, microphone use and exam
restrictions invalidate pending speech to prevent stale or overlapping audio.
Voice errors leave the text reply visible and show feedback. Startup still
depends on the voice service/network; this does not stream partially generated chat.
Run `flutter test --no-pub test/quick_sam_audio_test.dart test/quick_sam_bubble_test.dart`
for speed controls, short-segment startup, ordered playback and cancellation.
Native playback/audio quality still needs a device check.

## Student Home design

The student Home screen uses a navy/indigo school banner, a readable streak
summary with milestone badges, and compact illustrated Academics tiles with
clear labels and screen-reader hints. The nine destinations, profile, announcements, coin balance,
Quick Sam and bottom navigation retain their existing behavior. Tiles adapt to
narrow screens and larger system text; Home surfaces follow the selected theme.
The school banner is a compact logo/name row, followed by a compact streak
summary and Academics. Expand the streak arrow for milestone badges, freeze
details and personal best. Raised illustrated icon tiles use tighter spacing.
At least 70% of Academics is visible on a 390 × 844 phone at default text size,
including space for bottom navigation and safe areas. Smaller screens and larger
accessibility text remain scrollable rather than shrinking their text.
This layout update is student-mobile-only; web and teacher layouts are unchanged.
Existing bundled artwork is reused; no new dependencies or assets.

Run `flutter test --no-pub test/student_home_test.dart test/student_nav_shell_test.dart`
for phone/tablet layout, larger-text, streak-state and navigation checks.

## Student Services design

Student Services uses the same shared `StudentShortcutTile` as Home: raised
illustrated icons, compact gradient cards, tactile presses and theme-aware colors.
All eight services are retained; demo previews and Technical Query navigation
are unchanged. Grids switch to two columns for narrow screens or larger text.
Run `flutter test --no-pub test/student_services_layout_test.dart test/student_support_screen_test.dart`
for responsive layouts, preview selection/closing and support navigation.

## Student dark theme

Student surfaces and foregrounds resolve through `AppColors.of(context)`, which
depends on the inherited Material theme. This also updates already-mounted
constant widgets when Settings changes the theme, without resetting navigation
or screen state. Prefer this contextual palette in widgets over the legacy
global `AppColors.isDark` getters. Use its brighter accent for foregrounds on
dark panels, not as a replacement for brand button fills.

Home/profile, Services, bottom navigation, Orchard/detail/retention, Progress and
charts, Homework, Games, Calendar, Library, Rewards, announcements, support and
parental controls follow the selected theme. AI Tutor/Quick Sam retain their
intentional dark design; the decorative report-card paper retains explicit
contrasting ink while its surrounding page follows the theme.

`flutter test --no-pub test/student_dark_theme_test.dart` checks live theme
changes without remounting, dark text contrast (at least 4.5:1), saved-preference
precedence and Calendar readability at larger text sizes. Page-specific theme
regressions are covered by `orchard_dark_theme_test.dart`,
`progress_dark_theme_test.dart` and `tasks_games_dark_test.dart`.

## Independent teacher theme

The teacher's three-dot menu has a compact Dark theme switch above Logout.
Teacher and student theme selections are independent; switching roles no longer
copies the previous portal's appearance, and the login screen stays light.
The teacher selection is retained during the current app session (it defaults
to light on a fresh launch); student saved-preference behaviour is unchanged.
Teacher panels and the floating bottom bar update in place without resetting
the current tab or form state. Dark navigation uses the same surface, muted
icons and highlighted accent as the student bar.

The shared scheduling time wheel (homework, tests and announcements) uses the
active theme for its sheet, wheel text and Cancel/Done controls. Run
`flutter test --no-pub test/cupertino_time_picker_sheet_test.dart` for light/dark
contrast, large text, confirming a time and cancelling without a change.

Mock-test action buttons, manual grading fields and report-card entry panels
use theme-aware surfaces and contrasting text, including live theme switches
without losing drafts. Subject-coloured report-card controls use deeper shades
in dark mode; the AI Assistant keeps its intentional dark palette and released
report cards keep their contrasting paper-and-ink design.
`flutter test --no-pub test/teacher_contrast_test.dart` checks action contrast
(at least 4.5:1), light/dark switches, grading and saving report-card marks.

Run `flutter test --no-pub test/teacher_theme_test.dart test/student_dark_theme_test.dart test/role_router_test.dart test/widget_test.dart`
for role isolation, menu switching, navigation colours, retained state and logout.

The top-left teacher profile chip opens a read-only account card on every tab,
with a male/female teacher avatar (neutral when unspecified), name, school,
subject, login ID and registered teaching classes. Classes come from
`GET /teacher/profile`'s `grades`, not the roster or currently selected class.
That endpoint now also returns `gender` and `loginId`; deploy the backend update
alongside the mobile change. Missing fields are labelled unavailable and profile
errors have an explicit Retry action.
Run `flutter test --no-pub test/teacher_profile_chip_test.dart test/teacher_theme_test.dart`
for avatar/data display, both themes, large text, narrow screens and menu isolation.

## Compact mobile panels

Student and teacher support use one workspace: report/technician actions, a
collapsed **Your requests** list, and the active conversation or report form.
The initial chat uses a short welcome and a horizontal suggestion strip so
Message and Send are visible without scrolling on 320/390px-wide, 740px-high
phones at default text size. Full role-specific guidance remains available under
**About support & privacy**. Request-list errors remain visible when collapsed;
polling, pagination, retries, request selection and report/reply handling are
unchanged. Pull down to refresh requests/replies.

Shared cards, Services, Games, Orchard and teacher Home use tighter padding and
gaps; teacher Home shows the selected class in the dropdown rather than a second
duplicate badge. Charts, artwork, form fields and text scaling retain their
usable dimensions; larger accessibility text remains scrollable.

Run `flutter test --no-pub test/student_support_screen_test.dart` for measured
first-screen visibility, expandable content, 1.5x/2x text and both support roles.

Calendar day cells reserve a separate row below the date for event dots, including
on unmarked days so numbers stay aligned. Rows grow with accessibility text
instead of letting markers overlap dates. Run
`flutter test --no-pub test/student_calendar_layout_test.dart` for small-phone,
light/dark and selected-date marker placement through 2x text size.

## School-controlled learning calendar

School graph dates are read from the backend's shared learning-score response;
mobile never offers editing controls. The school's inclusive start/end dates
apply to overall and subject daily/monthly charts, while scores remain
cumulative and the current headline remains unchanged. Open student and teacher
Progress screens refresh every minute to pick up calendar changes. The default
timeline is retained until a school saves its calendar on the website.

## Exam results in Progress

The **Exam Results Journey** panel sits below the subject progress cards in
student Progress and the teacher's selected-student report. It reads the same
released report cards as web, compares all exams on a 0–100% scale, and lets the
viewer filter by subject and tap an exam for its original marks. New released
cards are checked every minute while the panel is open. Student Progress refresh
also refreshes exam results. This panel is separate from Learning Power; missing
subjects are gaps, and one exam does not imply a trend.

Run `flutter test --no-pub test/exam_results_journey_test.dart test/subject_progress_test.dart`
for normalization, trend, zero-mark and phone-layout coverage.

## Internal testing / TestFlight release preparation

Both platforms use the owner-confirmed permanent identifier `now.academix.app`
and display name **AcademiX**. Verify availability/register it in both developer
accounts before the first upload; changing it after publication creates a
different app. iOS test targets use `now.academix.app.RunnerTests`.
The version is `1.0.0+1`; increment the build number for each subsequent upload.

### Android signing

Copy [android/key.properties.example](android/key.properties.example) to private
`android/key.properties` and fill all four fields using your existing upload
keystore. Relative `storeFile` paths resolve from `mobile/android/`; absolute
paths work too. Use forward slashes and Java `.properties` escaping for special
characters. Keep the keystore outside Git, back it up securely, and never send
passwords through chat. Signing properties, JKS/keystore and Apple signing files
are gitignored. If a key has ever been committed, ignoring it does not remove
history or replace the need for rotation/recovery.

Release builds **fail** when upload signing is missing; there is no debug-key
fallback. Debug builds remain available for local testing.

```bash
flutter analyze
flutter test
flutter build appbundle --release --dart-define=API_BASE_URL=https://academix.now
```

Upload the signed `build/app/outputs/bundle/release/app-release.aab` to Google
Play **Internal testing**, not production. Do not upload a debug APK. Enable Play
App Signing and preserve the upload key. Resolve SDK/license requirements shown
by `flutter doctor -v`; the operator must review/accept Android licenses.

### Apple signing

Install full supported Xcode and required CocoaPods tooling, then open
`ios/Runner.xcworkspace`. Select the Apple developer team for Runner, register the
Bundle ID, and configure signing in Xcode. No team ID or certificates are
invented/committed here. Then:

```bash
flutter build ipa --release --dart-define=API_BASE_URL=https://academix.now
```

Upload the signed archive through Xcode Organizer/Transporter to App Store
Connect and start **TestFlight** testing. Native iOS compilation/signing cannot
be verified with Command Line Tools alone.

### Branding, permissions and verification

The illustrated AcademiX logo keeps the blue A, cap, open book, swoosh and gold
star, with a matte painted finish instead of glossy metallic shading.
`assets/branding/logo.png` is the transparent master, including the name and
tagline. The generator copies it byte-for-byte to the website's `public/logo.png`
and extracts the emblem for native/browser/store icons on opaque white squares.
Android density icons, all iOS asset-catalog sizes,
`assets/branding/store_icon.png` (512px Play listing source), website favicons,
touch/PWA icons and Flutter-web icons are generated together on macOS:

```bash
swift tool/build_launcher_icons.swift
flutter test test/role_router_test.dart test/release_configuration_test.dart test/widget_test.dart
```

The script uses the illustrated logo's emblem crop; review it after any logo
replacement. iOS icons have no alpha channel, and maskable browser icons have
extra safe-zone padding. Rebuild/relaunch the app after replacing bundled assets;
deploy the website assets to update the live site. Android Internet/microphone
permissions are in the main manifest so release builds don't depend on debug
permissions. iOS has explicit microphone/camera/photo-library purpose strings.
These declarations do not replace runtime consent or testing permission denial.

Production builds must use the live HTTPS API above. A developer's
`web/.env.local` may target localhost and is **not** a production mobile endpoint.
Never bundle backend `.env`, database passwords, service-role keys or an upload
keystore. Application-ID changes mean old development installs may coexist as a
separate app; sign in afresh and expect runtime permissions to be requested again.

### Remaining launch gates (not completed by configuration changes)

- Provide the existing private upload keystore for a signed AAB; configure Apple
  developer signing and full Xcode for the IPA.
- Publish owner-reviewed privacy/support pages; accurately complete Play Data
  safety and Apple App Privacy for student records, photos, microphone/audio,
  AI services and every relevant SDK. No placeholder policy URL is shipped.
- Decide and implement the required account-deletion/request flow for
  school-provisioned accounts, including retention obligations and the
  public deletion-request page where required. Logging out is not deletion;
  do not delete school records without an approved retention/scope decision.
- Verify children's/education requirements and AI-content reporting/safety,
  including required disclosure/consent before third-party personal-data sharing.
  Camera/microphone OS permission alone is not consent for all processing.
- Test student/teacher workflows, offline/error paths and denied permissions on
  real Android/iPhone devices. Provide reviewer accounts with synthetic data.
- Confirm production backend security fixes are deployed and both mobile roles
  work against that backend. Store acceptance is not established by a debug build.

Initial preparation validation: Android debug APK builds with the correct ID,
label and merged Internet/microphone permissions; release AAB intentionally
stops on missing signing. Flutter analysis passes. The full suite currently
includes nine existing failures in `test/natural_tree_art_test.dart` caused by
casting `ResizeImage` to `AssetImage`; they are not changed by release setup and
must be resolved before treating the full regression suite as green.

## Student navigation icon

Services uses an outlined grid when inactive and a filled rounded grid when
selected, matching Home's outline/filled treatment. Both use the same selected
accent, soft circular highlight and compact sizing in light and dark themes.
Run `flutter test --no-pub test/student_nav_shell_test.dart` to verify selection,
navigation and compact sizing in both themes.

## Homework layouts

Homework feedback and history actions wrap on narrow screens instead of forcing
buttons beyond the card edge. Subject mock-test headings wrap too. Layout
regressions cover 320/390/600px widths and text scaling up to 2x.

## Games layouts

Game hub cards and flashcard subject tabs size to their content. Gameplay titles
wrap while keeping Exit visible. Long flashcard questions and answers scroll
inside the flip card, with the reveal hint and Ask AI button kept separate from
the scrolling text. Regression tests cover narrow screens and larger text sizes.

## Learning progress

The app displays `GET /progress/learning-score` histories without recalculating
scores locally. Understanding, tree growth, tests/mock tests, practice and
homework all contribute to subject progress, including the daily/monthly graphs.
The subject breakdown includes homework. The shared backend must be deployed
for the updated calculation to appear in both mobile and web.

## Orchard mastery artwork

Oak trees use `assets/orchard/oak/fully_grown.png` and `acorns_1.png` through
`acorns_9.png`. Each Golden Fruit chapter (all sequential milestones, retention
reviews and at least 90% roots) earns one acorn. Merely completing a lesson or
repeating an activity does not earn extra acorns for the same chapter.
The first mastered chapter displays a grown oak; before mastery the existing
early growth artwork is retained, with the empty grown oak at the retention stages.

Above nine mastered lessons, the nine-acorn image is retained and one additional
`acorn.png` is placed in the upper canopy per mastered chapter. This transparent
sprite was isolated from the provided `acorns_1.png`; no AI-generated art is used.
The numeric mastery label remains exact even when a large curriculum makes fruits small.
Counts use current-class uploaded chapters only and are not capped at nine.

Natural themes use apples for Science (`crystal`), cherry rewards for English
(`cherry_blossom`), oranges for Social Studies (`banyan`), pears for Computer
(`digital`), and mangoes for Hindi (`mango`). Existing catalog identifiers stay
unchanged, including dynamic-subject aliases. Each cherry reward is drawn as a
pair of cherries but represents one mastered lesson, not two.

Four additional themes (lemon, peach, plum and strawberry) supply automatic
school-wide assignments for new subjects. The backend returns the assigned
`treeType`; neither client guesses from the subject name. It fills unused designs
before reusing the ten-theme pool. Persisted mappings keep each subject's design
stable and never combine different subjects' learning progress.
Strawberry uses the `strawberry` tree key and `assets/orchard/strawberry/` folder.
Older stored `coconut` assignments are normalized to strawberry by the backend
and supported as a client alias. Existing assignments and growth remain intact;
this replacement requires no additional migration.

Each theme has a newly designed seed, sprout and young plant on a transparent
2048 x 2048 canvas. Growing, mature and fully-grown PNGs reuse the supplied oak
art byte-for-byte. `mastery_fruit.png` is overlaid at the nine measured oak positions,
then the same upper-canopy layout as oak above nine. No new full-tree PNG is
needed for each chapter count. Web assets are identical to mobile assets.

`tool/build_orchard_art.py` builds the natural PNGs from the reviewed five-column,
four-row generated asset sheet (1254 x 1254), using Pillow, and mirrors assets to
`web/public/assets/orchard/`. The source is retained at
`tool/artwork/natural-fruit-sheet.png`; `--sheet /path/to/the/sheet.png` can replace it.
The four-column extension source is `tool/artwork/extra-fruit-sheet.png`;
`--extra-sheet /path/to/the/extra-sheet.png` can replace it. Both sources are
bundled for regeneration. Install Pillow before running the script.
`tool/artwork/strawberry-sheet.png` overrides the former coconut column.
Use `--strawberry-sheet /path/to/sheet.png --strawberry-only` to regenerate only
that theme and mirror it to web. The reviewed strawberry source is 1254 x 1254
with one column of seed, sprout, young plant and fruit.
The generated sheet provides natural seeds, seedlings and fruits; oak originals
are not edited.

Deploy the backend that exposes `masteredChapters` in both Orchard endpoints
before deploying the updated clients. The mastery count itself needs no schema
change, but stable school assignments require applying
`backend/db/migrations/20261112_orchard_school_tree_assignments.sql` before
deploying the updated backend. See [backend setup](../backend/README.md).
Older backends never infer mastery from completion: natural trees display no
mastery fruits without the count, while oak keeps its previous stage art.
Learning stages and rewards remain unchanged. Stop and relaunch Flutter after
adding or replacing these bundled PNGs.

Orchard detail stat cards use content-sized, equal-height pairs rather than a
fixed grid aspect ratio, so wrapped labels and larger accessibility text fit.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.
