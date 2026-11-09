# mobile

A new Flutter project.

## Student navigation icon

The Services bottom-navigation icon uses `assets/branding/services.png`.
Use a transparent PNG; its silhouette is tinted to match the selected/unselected
navigation colors and scales down with the compact navigation bar.
After adding or replacing a bundled image, stop and relaunch the app to refresh assets.

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
