# 🌳 Knowledge Orchard — Tree Art Spec Sheet (for the Artist)

Thank you for creating the artwork for our learning app! This document has
**everything you need**. You do not need to touch any code — just create the
images following the rules below and hand them over. They get dropped into a
folder and the app uses them automatically.

---

## 1. The Big Idea

In our app, **each school subject is a tree**. As a student learns and completes
tasks, their tree **grows up in 8 stages** — from a tiny seed to a glowing
golden-fruit tree. So for each tree you draw **the same tree at 8 different ages**.

Think of it like a growth animation with 8 frames:

```
🌰 seed  →  🌱 sprout  →  🌿 young plant  →  🌳 growing tree
     →  🌲 mature tree  →  🌸 blossom  →  🍎 fruit  →  ✨ golden fruit
```

There are **6 trees** (one per subject). So the core set is:

> **6 trees × 8 stages = 48 base images.**
> Plus optional **facial-expression (mood) variants** — see Section 2b. Those
> can be added later; the app works with just the 48 to start.

You can start with **just ONE tree** (the Oak / Mathematics) to test — 8 images —
and do the rest later.

---

## 2. The 8 Growth Stages (draw the SAME tree at each age)

| # | Stage name (used for file name) | What it should look like |
|---|-------------------------------|--------------------------|
| 1 | `seed`         | A seed resting in a little mound of soil. No plant yet. |
| 2 | `sprout`       | First tiny green shoot just breaking through the soil. |
| 3 | `young_plant`  | A small plant with a few leaves. Thin, delicate. |
| 4 | `growing_tree` | A small tree — real trunk forming, more leaves. |
| 5 | `mature_tree`  | A full, healthy tree with a nice leafy canopy. |
| 6 | `blossom`      | The mature tree now **covered in flowers/blossoms**. |
| 7 | `fruit`        | The tree with **ripe fruit** hanging in it. |
| 8 | `golden_fruit` | The tree with **glowing / golden fruit + sparkles** — the "mastered" celebration look. |

---

## 2b. The Tree is ALIVE — Draw a FACE on the Tree (Moods)

**Yes, this is exactly what we want:** please **draw a cute face — two eyes and
a mouth — directly onto the tree itself** (like a Disney/Pixar character tree).
The **expression changes** based on how well the student is caring for it. This
is what makes the orchard feel alive.

> ✋ Important: the face is **hand-drawn as part of the tree art** (eyes + mouth
> on the trunk/canopy). We are **NOT** using emoji or sticking a separate smiley
> on top. It should look like the tree itself is smiling, worried, etc.

### Where to put the face
- Draw the eyes and mouth on the **trunk** (like a friendly tree face) OR nestled
  in the lower **canopy** — whichever looks cuter for that tree. 
- **Keep the face in the SAME spot and same size** across all the mood versions of
  a stage, so only the expression changes (not the position). This makes the
  swap look like the tree is changing its expression, not moving its face around.

### The 4 expressions to draw
Draw the **same tree**, changing only the **eyes + mouth** (and optionally small
touches like droopy vs perky leaves):

| Mood | When the app shows it | How to draw the face | Optional extra touches |
|------|-----------------------|----------------------|------------------------|
| `happy`   | Healthy & growing well | Open bright eyes, a friendly **smile** (mouth curved up) | Leaves perky, colors vivid |
| `sad`     | Thirsty / falling behind | Eyes looking down/worried, **frown** (mouth curved down), maybe a tiny sweat drop | Leaves droop a little, colors duller |
| `sleepy`  | Neglected a long time | **Closed / droopy sleepy eyes**, small "zzz", flat or tiny mouth | Leaves drooping more, a few leaves falling |
| `excited` | Celebration — mastered (golden) | **Big joyful open smile**, sparkly/star eyes | Sparkles, glow, cheeks blushing |

**The easy way to make them (so it's not a lot of extra work):**
- Draw the tree body **once per stage**. Then **duplicate that image and just
  redraw the eyes + mouth** for each mood. The tree body stays identical.
- The **`happy` version is the normal/main image** from Section 2 — so the plain
  stage picture already IS the happy face. The extra work is only drawing the
  other expressions.

**How many expressions per stage?** To keep it manageable:
- **Seed 🌰 and Sprout 🌱**: too tiny for a face — **no face needed**, skip moods.
- **All other 6 stages** (`young_plant` → `golden_fruit`): draw a **happy** and a
  **sad** face. **`sleepy` and `excited` are nice-to-have bonuses** (excited is
  best used for `golden_fruit`).

> 💡 Deliver in priority order (Section 8): first all the normal/happy images,
> then the `sad` faces, then `sleepy`/`excited`. Nothing breaks if a mood is
> missing — the app just keeps showing the happy face until you add the others.

---

## 3. The 6 Trees (each has its own personality)

Each subject tree has a theme so the orchard looks colorful and varied.

| Subject         | Tree theme          | Fruit           | Folder name (exact) |
|-----------------|---------------------|-----------------|---------------------|
| Mathematics     | Oak tree            | Golden apples 🍎 | `oak`               |
| Science         | Crystal tree        | Blue crystals 💎 | `crystal`           |
| English         | Cherry blossom tree | Pink cherries 🍒 | `cherry_blossom`    |
| Social Studies  | Banyan tree         | Wisdom fruit 🟠  | `banyan`            |
| Computer        | Digital / pixel tree| Pixel fruit 🟢   | `digital`           |
| Hindi           | Mango tree          | Mangoes 🥭       | `mango`             |

> 💡 The fruit theme mainly matters for the last 3 stages (`blossom`, `fruit`,
> `golden_fruit`). For the crystal and digital trees, feel free to be creative —
> e.g. the Science tree can grow glowing crystals instead of normal fruit, and
> the Computer tree can have a pixel-art / techy style.

**Suggested starting order:** `oak` (Mathematics) first — that's the one we're
testing right now.

---

## 4. Technical Requirements ✅

Please follow these so the art fits perfectly in the app:

### Format
- **PNG with a TRANSPARENT background** (this is the most important rule).
- SVG or WebP are also fine, but PNG is preferred.
- ❗ No white box / no colored background — the app places the tree on its own
  grass-and-sky scene, so the area around the tree must be see-through.

### Size / canvas
- **Square canvas.** Recommended **1024 × 1024 px** (or at least 512 × 512).
- Bigger is safe — the app shrinks it down as needed. Just keep it **square**.

### Composition (⭐ the most important part for smooth "growing")
- Draw **all 8 stages on the same square canvas size**.
- Place the tree **standing at the bottom-center**, and keep the **base of the
  trunk / the ground line at the SAME height and position in all 8 images.**
- Reason: when the tree "grows" from one stage to the next, the app just swaps
  the picture. If the trunk base stays in the same spot, it looks like the tree
  is genuinely growing out of the same ground. If it moves around, it looks jumpy.
- Leave some **empty space at the top** so the tall stages (mature, fruit,
  golden) have room and don't get cut off.

Simple mental model:
```
┌───────────────┐  ← same square canvas for every stage
│               │
│      🌲       │  ← tree grows UPWARD from here
│               │
│               │
│ ~~~~~~~~~~~~~~ │  ← keep this ground line in the SAME place every time
└───────────────┘
```

### Style
- Warm, friendly, storybook / 3D-cartoon look (it's for school kids).
- Bright and cheerful. The `golden_fruit` stage should feel like a reward
  (a subtle glow or sparkle baked into the image looks great).

---

## 5. File Naming (must be EXACT — all lowercase)

**The 8 base (happy) images** — every tree folder needs these:

```
seed.png
sprout.png
young_plant.png
growing_tree.png
mature_tree.png
blossom.png
fruit.png
golden_fruit.png
```

**Mood versions** — add the mood word before `.png`. Seed & sprout don't need
moods. Example for the other stages:

```
mature_tree.png          ← the happy/normal one (already above)
mature_tree.sad.png      ← worried face
mature_tree.sleepy.png   ← neglected/sleepy (optional)
mature_tree.excited.png  ← celebration (optional; mainly for golden_fruit)
```

So the full name pattern is: `<stage>.<mood>.png` (the plain `<stage>.png` = happy).

> ⚠️ Names must match exactly (lowercase, with underscores). `Sprout.png` or
> `young plant.png` will NOT work — it must be `sprout.png` and `young_plant.png`.

---

## 6. How to Hand Over the Files

Easiest way: for each tree, put its images in a folder named after the tree,
zip it, and send it. For example:

```
oak.zip
 └── seed.png
 └── sprout.png
 └── young_plant.png
 └── young_plant.sad.png
 └── growing_tree.png
 └── growing_tree.sad.png
 └── mature_tree.png
 └── mature_tree.sad.png
 └── blossom.png
 └── blossom.sad.png
 └── fruit.png
 └── fruit.sad.png
 └── golden_fruit.png
 └── golden_fruit.excited.png
```

That's it! The developer drops the folder into the app and the trees + moods
appear automatically — no code changes needed.

---

## 7. What You DON'T Need to Worry About

- ❌ You do NOT need to make animations — just still images. The app handles the
  "living" feel by swapping between your happy/sad/sleepy/excited pictures.
- ❌ You do NOT need seasons (autumn leaves, snow, etc.) for now.
- ❌ You do NOT need to worry about the numbers, buttons, or background scene —
  just the tree by itself on a transparent background.
- ❌ You do NOT need a mood for seed & sprout (too tiny for a face).

---

## 8. Quick Checklist (per tree)

- [ ] 8 base/happy PNG images, transparent background
- [ ] Square canvas (1024×1024 recommended)
- [ ] Trunk base / ground line in the SAME spot in all images
- [ ] Space left at the top for tall stages
- [ ] A **hand-drawn face (eyes + mouth) ON the tree** from `young_plant` onward,
      kept in the same spot/size across that stage's moods
- [ ] `sad` face versions for the 6 faced stages (`young_plant` → `golden_fruit`)
- [ ] (Bonus) `sleepy` and `excited` faces where it makes sense
- [ ] Files named exactly, moods as `<stage>.<mood>.png`
- [ ] Zipped in a folder named after the tree (`oak`, `crystal`, etc.)

### 📦 Suggested delivery order (so nothing is overwhelming)
1. **Priority 1:** the 8 base/happy images for the **Oak (Mathematics)** tree.
2. **Priority 2:** the 6 `sad` images for Oak.
3. **Priority 3:** Oak `sleepy` + `excited` (at least `golden_fruit.excited`).
4. Repeat 1–3 for the other 5 trees.

---

### 🎯 Recommended first delivery
Just the **Oak (Mathematics)** tree — all 8 stages. We'll load it, view it live in
the app, confirm the look and sizing are perfect, then you can happily create the
other 5 trees the same way.

Thank you so much! 🌳✨
