# AcademiX mobile

The native app supports **Student and Teacher only**. School administrators use
the website; there is no mobile school portal. Restored school/unsupported-role
sessions show a web-only/unsupported notice and can sign out, never fall through
to the student portal. Web school administration and existing API/session
contracts remain unchanged.

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

The Services bottom-navigation icon uses `assets/branding/services.png`.
Use a transparent PNG; its silhouette is tinted to match the selected/unselected
navigation colors and scales down with the compact navigation bar.
After adding or replacing a bundled image, stop and relaunch the app to refresh assets.

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
