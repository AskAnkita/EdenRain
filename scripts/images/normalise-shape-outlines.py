#!/usr/bin/env python3
"""Even out the cut drawings so a marquise and a round read as the same size icon.

The drawings arrive from the illustrator on a 256 canvas with every stone normalised to
the same height. That is the obvious way to do it and it is wrong on screen: the menu
fits each file into one square box, so a round (230 wide by 230 tall) puts twice the ink
in that box as a marquise (113 wide by 230 tall) and reads as a far bigger icon beside
it. Height is equal; size is not.

Equalising the area instead overcorrects. A marquise carrying a round's area would stand
half again as tall as everything around it, break the line of the column and look like a
mistake in the other direction. So each stone is scaled by

    (geometric mean of its sides) ** -P

with P = 0.5 -- exactly half way between equal-height (P = 0) and equal-area (P = 1) --
and the set is then lifted together so the tallest stone still fills the 230 the drawings
were delivered at. A round comes down to about 193, a marquise stays where it is, and the
spread in ink between the heaviest and lightest closes from 2.1x to 1.4x. The shapes keep
their true proportions throughout: only their scale changes.

Re-running this on its own output would shrink the set again, so it reads from the
untouched drawings in shape-outline-source/ rather than from assets/. A new cut is added
by dropping its file in there and running this; everything else is regenerated with it,
because the scale of each stone depends on the rest of the set.

Pillow only:

    python3 scripts/images/normalise-shape-outlines.py
    python3 scripts/images/normalise-shape-outlines.py --power 0.65 --check

--check writes a before-and-after contact sheet to the temp directory so the set can be
eyeballed in one look; it is not a theme asset.
"""

import argparse
import glob
import os
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE_DIR = os.path.join(ROOT, 'scripts', 'images', 'shape-outline-source')
OUTPUT_DIR = os.path.join(ROOT, 'assets')

# The canvas the drawings are delivered on, and the height the tallest stone keeps on it.
# Both are held so the files stay drop-in replacements for the ones already uploaded.
CANVAS = 256
MAX_INK = 230


def read_sources(source_dir):
    """Each drawing cropped to its ink, so the padding in the file cannot skew the scale."""
    shapes = {}
    for path in sorted(glob.glob(os.path.join(source_dir, 'shape-outline-*.png'))):
        name = os.path.basename(path)[len('shape-outline-'):-len('.png')]
        image = Image.open(path).convert('RGBA')
        box = image.split()[3].getbbox()
        if box is None:
            raise SystemExit(f'{name}: the drawing is empty')
        shapes[name] = image.crop(box)
    if not shapes:
        raise SystemExit(f'no drawings found in {source_dir}')
    return shapes


def target_heights(shapes, power):
    """The height each stone wants, scaled so the tallest still reaches MAX_INK."""
    wants = {}
    for name, ink in shapes.items():
        width, height = ink.size
        wants[name] = height * (width * height) ** (-power / 2)
    lift = MAX_INK / max(wants.values())
    return {name: round(want * lift) for name, want in wants.items()}


def write(shapes, heights, output_dir):
    rows = []
    for name, ink in shapes.items():
        width, height = ink.size
        new_height = heights[name]
        new_width = max(1, round(width * new_height / height))
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.alpha_composite(
            ink.resize((new_width, new_height), Image.LANCZOS),
            ((CANVAS - new_width) // 2, (CANVAS - new_height) // 2),
        )
        canvas.save(os.path.join(output_dir, f'shape-outline-{name}.png'), optimize=True)
        rows.append((name, (width, height), (new_width, new_height)))
    return rows


def contact_sheet(shapes, heights, path):
    """Before and after side by side, at roughly the size the menu draws them."""
    box = 96
    sheet = Image.new('RGB', (box * 2 + 30, box * len(shapes)), 'white')
    for index, (name, ink) in enumerate(sorted(shapes.items())):
        width, height = ink.size
        after_height = heights[name]
        after_width = max(1, round(width * after_height / height))
        pairs = [(width, height), (after_width, after_height)]
        for column, (ink_width, ink_height) in enumerate(pairs):
            canvas = Image.new('RGBA', (CANVAS, CANVAS), (255, 255, 255, 255))
            canvas.alpha_composite(
                ink.resize((ink_width, ink_height), Image.LANCZOS),
                ((CANVAS - ink_width) // 2, (CANVAS - ink_height) // 2),
            )
            sheet.paste(
                canvas.convert('RGB').resize((box, box), Image.LANCZOS),
                (column * (box + 30), index * box),
            )
    sheet.save(path)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default=SOURCE_DIR, help='the untouched drawings')
    parser.add_argument('--output', default=OUTPUT_DIR, help='where the theme assets go')
    parser.add_argument(
        '--power',
        type=float,
        default=0.5,
        help='0 leaves the heights equal, 1 makes the areas equal, 0.5 splits the difference',
    )
    parser.add_argument('--check', action='store_true', help='write a contact sheet as well')
    args = parser.parse_args()

    shapes = read_sources(args.source)
    heights = target_heights(shapes, args.power)
    rows = write(shapes, heights, args.output)

    for name, (width, height), (new_width, new_height) in rows:
        before = (width * height) ** 0.5
        after = (new_width * new_height) ** 0.5
        print(
            f'{name:10} {width:3}x{height:3} -> {new_width:3}x{new_height:3}'
            f'   ink {before:5.1f} -> {after:5.1f}'
        )

    if args.check:
        path = contact_sheet(
            shapes, heights, os.path.join(tempfile.gettempdir(), 'shape-outlines-check.png')
        )
        print(f'\ncontact sheet: {path}')


if __name__ == '__main__':
    main()
