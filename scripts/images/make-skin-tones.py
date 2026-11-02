#!/usr/bin/env python3
"""Re-tone a model shot into a ladder of skin tones for the skin-tone preview slider.

The shoot gives us one hand per ring. The slider needs the same hand, same pose, same
lighting, in a range of skin tones, so the renders are derived from the photograph rather
than re-shot: the skin is isolated and its mid-tone is mapped onto each target tone with a
per-channel gamma curve. Gamma keeps both ends of the scale fixed (black stays black,
white stays white), so the shading, the veins and the knuckle creases survive the shift
instead of flattening the way a straight multiply or a CSS filter would.

Two things are held back from the mapping:

  * anything unsaturated -- the background, the diamond -- which is why the mask is built
    from saturation rather than from a silhouette;
  * the jewellery itself, found inside a hand-given bounding box as the gold, the bright
    stone and the neutral pavé, then morphologically closed so the band's shadowed links
    join it. Yellow gold and deep skin sit close together in hue, so the box is what keeps
    a yellow band out of the skin mask.

Pillow and numpy only:

    python3 scripts/images/make-skin-tones.py
    python3 scripts/images/make-skin-tones.py --source assets/other-hand.png --prefix other-hand-tone
    python3 scripts/images/make-skin-tones.py --ring-box 394,470,546,578 --check

--check writes a contact sheet to the temp directory so the ladder can be eyeballed in one
look; it is not a theme asset. The renders go to assets/ as <prefix>-1.jpg ...
<prefix>-6.jpg, lightest first, with the last one the untouched photograph.
"""

import argparse
import sys
import tempfile
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageFilter
except ImportError:  # pragma: no cover - a plain message beats a traceback
    sys.exit('This script needs Pillow and numpy: python3 -m pip install pillow numpy')

REPO = Path(__file__).resolve().parents[2]

# Lightest to deepest. The mid-tone each render is mapped onto, and the swatch colour the
# section shows for it -- the swatch is the tone itself, a shade down so it reads on white.
TONES = [
    ('light', (236, 204, 184)),
    ('light-medium', (224, 182, 157)),
    ('medium', (201, 154, 124)),
    ('medium-deep', (174, 126, 96)),
    ('deep', (143, 97, 69)),
    ('rich-deep', None),  # the photograph as shot
]


def soft_mask(array, channel_filter):
    """A 0..1 mask, feathered, from a boolean-ish float array."""
    image = Image.fromarray((np.clip(array, 0, 1) * 255).astype(np.uint8))
    return np.asarray(channel_filter(image)).astype(np.float32) / 255.0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default='assets/pear-ring-hand-skin-tone-pose.png')
    parser.add_argument('--prefix', default='pear-ring-hand-tone')
    parser.add_argument('--out-dir', default='assets')
    parser.add_argument('--ring-box', default='385,460,560,590',
                        help='left,top,right,bottom of the jewellery, in source pixels')
    parser.add_argument('--quality', type=int, default=88)
    parser.add_argument('--check', action='store_true', help='also write a contact sheet')
    args = parser.parse_args()

    source = (REPO / args.source) if not Path(args.source).is_absolute() else Path(args.source)
    out_dir = (REPO / args.out_dir) if not Path(args.out_dir).is_absolute() else Path(args.out_dir)
    image = Image.open(source).convert('RGB')
    width, height = image.size

    rgb = np.asarray(image).astype(np.float32) / 255.0
    hsv = np.asarray(image.convert('HSV')).astype(np.float32)
    hue, sat, val = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255

    left, top, right, bottom = (int(n) for n in args.ring_box.split(','))
    box = np.zeros((height, width), bool)
    box[top:bottom, left:right] = True

    jewellery = box & (((hue >= 19) & (sat >= 0.58)) | (val >= 0.70) | (sat <= 0.28))
    jewellery = soft_mask(
        jewellery.astype(np.float32),
        lambda im: im.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(0.8)),
    )

    # Skin fades in over the first few points of saturation: the background sits at 0.00-0.03
    # and the translucent rim light along the fingers at 0.08-0.15, and ramping rather than
    # cutting is what keeps that rim from surviving as a red fringe once the skin lightens.
    skin = np.clip((sat - 0.03) / 0.09, 0, 1)
    mask = soft_mask(np.clip(skin - jewellery, 0, 1), lambda im: im.filter(ImageFilter.GaussianBlur(1.5)))

    # The tone to move away from: lit skin only, so neither the shadow side of the hand nor
    # a blown highlight drags the median around.
    core = (skin > 0.5) & (jewellery < 0.2) & (val > 0.2) & (val < 0.75) & (sat > 0.35)
    median = np.array([np.median(rgb[..., c][core]) for c in range(3)])
    mid = ', '.join(str(int(round(c * 255))) for c in median)
    print(f'{source.name}: skin mid-tone ({mid}), lit skin is {100 * core.mean():.0f}% of the frame')

    out_dir.mkdir(parents=True, exist_ok=True)
    renders = []
    for index, (name, target) in enumerate(TONES, start=1):
        if target is None:
            toned = rgb
        else:
            gamma = (np.log(np.array(target, dtype=np.float32) / 255.0) / np.log(median)).reshape(1, 1, 3)
            shifted = np.clip(rgb, 1e-4, 1.0) ** gamma
            toned = rgb * (1 - mask[..., None]) + shifted * mask[..., None]
        render = Image.fromarray((np.clip(toned, 0, 1) * 255).round().astype(np.uint8))
        path = out_dir / f'{args.prefix}-{index}.jpg'
        render.save(path, quality=args.quality, subsampling=1, optimize=True)
        print(f'  {path.relative_to(REPO)}  {name:<12} {path.stat().st_size // 1024} KB')
        renders.append(render)

    if args.check:
        tile = 420
        sheet = Image.new('RGB', (tile * len(renders), tile), 'white')
        for i, render in enumerate(renders):
            sheet.paste(render.resize((tile, tile), Image.LANCZOS), (tile * i, 0))
        sheet_path = Path(tempfile.gettempdir()) / f'{args.prefix}-contact-sheet.png'
        sheet.save(sheet_path)
        print(f'  contact sheet: {sheet_path}')


if __name__ == '__main__':
    main()
