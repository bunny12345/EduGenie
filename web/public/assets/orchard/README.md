# Knowledge Orchard — Tree Artwork

Drop your tree images here. The UI discovers them automatically — **no code changes needed**.

## Folder & file naming

```
web/public/assets/orchard/<treeType>/<stage>.<ext>
```

- **treeType** (one folder per subject tree):
  - `oak` — Mathematics (Golden Apples 🍎)
  - `crystal` — Science (Blue Crystals 💎)
  - `cherry_blossom` — English (Pink Cherries 🍒)
  - `banyan` — Social Studies (Wisdom Fruits 🟠)
  - `digital` — Computer (Pixel Fruits 🟢)
  - `mango` — Hindi (Mangoes 🥭)

- **stage** (8 growth stages, one image each):
  - `seed`
  - `sprout`
  - `young_plant`
  - `growing_tree`
  - `mature_tree`
  - `blossom`
  - `fruit`
  - `golden_fruit`

- **ext**: `png` (preferred), `svg`, or `webp`. The loader tries png → svg → webp.

## Facial expressions (moods)

The tree is "alive" — its expression changes with how well it's cared for. Add
mood variants by inserting a mood word before the extension:

```
web/public/assets/orchard/<treeType>/<stage>.<mood>.png
```

- **mood**: `happy` (healthy), `sad` (thirsty/behind), `sleepy` (wilting/neglected),
  `excited` (celebration / golden). The plain `<stage>.png` is treated as `happy`.
- Loader order per stage: `<stage>.<mood>.png` → `<stage>.happy.png` → `<stage>.png`
  → svg/webp → emoji placeholder. So moods are fully optional and incremental.

Example: `web/public/assets/orchard/oak/mature_tree.sad.png`


## Example

```
web/public/assets/orchard/oak/seed.png
web/public/assets/orchard/oak/sprout.png
web/public/assets/orchard/oak/growing_tree.png
...
web/public/assets/orchard/mango/golden_fruit.png
```

That's 6 trees × 8 stages = **48 images** for the complete set. You can add them
incrementally — any stage without an image shows a styled emoji placeholder until
the file is added.

## Recommended specs
- Square canvas (e.g. 512×512), transparent background (PNG/WEBP) or SVG.
- Centered tree, consistent ground line across stages so growth looks continuous.
- Same art direction as the mockup (3D storybook style) for best results.
