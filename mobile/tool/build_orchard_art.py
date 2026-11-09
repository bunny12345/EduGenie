"""Build aligned natural-fruit PNGs from the generated sheet and supplied oak art.

Run with Pillow installed:
python mobile/tool/build_orchard_art.py --sheet /path/to/natural-fruit-sheet.png
"""

import argparse
from pathlib import Path
from shutil import copyfile

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
MOBILE = ROOT / "mobile/assets/orchard"
WEB = ROOT / "web/public/assets/orchard"
TYPES = ["crystal", "cherry_blossom", "banyan", "digital", "mango"]
EXTRA_TYPES = ["lemon", "peach", "plum", "strawberry"]
ROW_BOUNDS = [(50, 290), (340, 575), (600, 890), (915, 1210)]
EXTRA_ROW_BOUNDS = [(50, 290), (315, 575), (595, 905), (915, 1210)]
STRAWBERRY_ROW_BOUNDS = [(40, 250), (270, 525), (535, 855), (870, 1225)]


def cutout(sheet, column, row, columns=5):
    left = round(column * sheet.width / columns)
    right = round((column + 1) * sheet.width / columns)
    bounds = STRAWBERRY_ROW_BOUNDS if columns == 1 else ROW_BOUNDS if columns == 5 else EXTRA_ROW_BOUNDS
    reference_height = 1280 if columns == 1 else 1254
    top, bottom = (round(value * sheet.height / reference_height) for value in bounds[row])
    tile = sheet.crop((left, top, right, bottom)).convert("RGBA")
    if tile.getchannel("A").getextrema()[0] < 255:
        # Generated transparent sheets can have near-invisible alpha speckles
        # across the whole cell, which would shrink the actual fruit on resize.
        tile.putalpha(tile.getchannel("A").point(lambda alpha: alpha if alpha >= 32 else 0))
        bounds = tile.getbbox()
        if bounds is None:
            raise ValueError(f"Empty artwork cell {column}, {row}")
        return tile.crop(bounds)
    pixels = []
    for red, green, blue, _ in tile.get_flattened_data():
        # Remove the almost-white paper without affecting fruit or green leaves.
        light = min(red, green, blue)
        alpha = max(0, min(255, (245 - light) * 255 // 45)) if light > 200 else 255
        if alpha:
            red, green, blue = (
                max(0, min(255, round((channel - (255 - alpha)) * 255 / alpha)))
                for channel in (red, green, blue)
            )
        pixels.append((red, green, blue, alpha))
    tile.putdata(pixels)
    bounds = tile.getbbox()
    if bounds is None:
        raise ValueError(f"Empty artwork cell {column}, {row}")
    return tile.crop(bounds)


def ground_layer():
    seed = Image.open(MOBILE / "oak/seed.png").convert("RGBA")
    ground = Image.new("RGBA", seed.size)
    soil = (130, 78, 30, 255)
    ground.putdata([
        soil if index // 2048 >= 1650 and not (800 < index % 2048 < 1150 and index // 2048 < 1780)
        and alpha > 0 and abs(red - soil[0]) < 5
        and abs(green - soil[1]) < 5 and abs(blue - soil[2]) < 5
        else (0, 0, 0, 0)
        for index, (red, green, blue, alpha) in enumerate(seed.get_flattened_data())
    ])
    ImageDraw.Draw(ground).ellipse((750, 1680, 1180, 1840), fill=soil)
    return ground


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def main():
    parser = argparse.ArgumentParser()
    source_sheet = ROOT / "mobile/tool/artwork/natural-fruit-sheet.png"
    parser.add_argument("--sheet", type=Path, default=source_sheet)
    extra_source = ROOT / "mobile/tool/artwork/extra-fruit-sheet.png"
    parser.add_argument("--extra-sheet", type=Path, default=extra_source)
    strawberry_source = ROOT / "mobile/tool/artwork/strawberry-sheet.png"
    parser.add_argument("--strawberry-sheet", type=Path, default=strawberry_source)
    parser.add_argument("--strawberry-only", action="store_true")
    args = parser.parse_args()
    sheet = Image.open(args.sheet)
    if sheet.size != (1254, 1254):
        raise ValueError("Expected the reviewed 1254 x 1254, five-column asset sheet.")
    source_sheet.parent.mkdir(parents=True, exist_ok=True)
    if args.sheet.resolve() != source_sheet.resolve():
        copyfile(args.sheet, source_sheet)
    extra_sheet = Image.open(args.extra_sheet)
    if extra_sheet.width != extra_sheet.height:
        raise ValueError("Expected a square four-column extra fruit sheet.")
    if args.extra_sheet.resolve() != extra_source.resolve():
        copyfile(args.extra_sheet, extra_source)
    strawberry_sheet = Image.open(args.strawberry_sheet)
    if strawberry_sheet.size != (1254, 1254):
        raise ValueError("Expected the reviewed 1254 x 1254 strawberry asset sheet.")
    if args.strawberry_sheet.resolve() != strawberry_source.resolve():
        copyfile(args.strawberry_sheet, strawberry_source)
    soil = ground_layer()
    for column, tree_type in enumerate([*TYPES, *EXTRA_TYPES]):
        art_sheet = sheet if column < len(TYPES) else extra_sheet
        art_column = column if column < len(TYPES) else column - len(TYPES)
        columns = 5 if column < len(TYPES) else 4
        if tree_type == "strawberry":
            art_sheet, art_column, columns = strawberry_sheet, 0, 1
        elif args.strawberry_only:
            continue
        folder = MOBILE / tree_type
        folder.mkdir(parents=True, exist_ok=True)
        for row, stage in enumerate(["seed", "sprout", "young_plant"]):
            plant = cutout(art_sheet, art_column, row, columns)
            height = [230, 250, 420][row]
            plant = plant.resize((round(plant.width * height / plant.height), height), Image.Resampling.LANCZOS)
            image = Image.new("RGBA", (2048, 2048))
            image.alpha_composite(plant, ((2048 - plant.width) // 2, 1785 - height))
            image.alpha_composite(soil)
            save(image, folder / f"{stage}.png")
        fruit = cutout(art_sheet, art_column, 3, columns)
        fruit = fruit.resize(
            (round(fruit.width * 256 / fruit.height), 256), Image.Resampling.LANCZOS
        )
        padded = Image.new("RGBA", (fruit.width + 32, fruit.height + 32))
        padded.alpha_composite(fruit, (16, 16))
        glow = Image.new("RGBA", padded.size, (255, 255, 255, 0))
        glow.putalpha(padded.getchannel("A").filter(ImageFilter.GaussianBlur(8)))
        glow.alpha_composite(padded)
        save(glow, folder / "mastery_fruit.png")
        for stage in ["growing_tree", "mature_tree", "fully_grown"]:
            copyfile(MOBILE / "oak" / f"{stage}.png", folder / f"{stage}.png")

    # Identical bundled art for both clients; oak originals stay untouched.
    for tree_type in ["oak", *TYPES, *EXTRA_TYPES]:
        if args.strawberry_only and tree_type != "strawberry":
            continue
        (WEB / tree_type).mkdir(parents=True, exist_ok=True)
        for source in (MOBILE / tree_type).glob("*.png"):
            copyfile(source, WEB / tree_type / source.name)
    print("Built and synchronized strawberry artwork." if args.strawberry_only
          else "Built nine natural fruit themes and synchronized all ten trees to web.")


if __name__ == "__main__":
    main()
