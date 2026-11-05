"""Lift a warm studio backdrop off a diamond piece and lay the piece on white.

Two cuts, in this order:

1. Neutrality. The backdrop in these shots - olive, brown, and the torn paper laid over it - is
   warm: its red, green and blue sit far apart. Diamond and white gold are neutral, their three
   channels almost on top of each other. Cutting on how neutral a pixel is rather than on how
   bright it is is what lets the bright paper go while the stones stay.

2. A vertical opening. What survives the first cut is the paper's torn edge, a fibrous grey line
   a few pixels deep running the width of the frame. Eroding and then dilating down the columns
   takes out anything shallower than the window and leaves everything taller: the stones are
   round and the chains hang, so both keep their full height, and the line goes.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter


def _shift_stack(x, k):
    """The k vertical neighbours of every pixel, edge-padded, as one array."""
    pad = k // 2
    padded = np.pad(x, ((pad, pad), (0, 0)), mode='edge')
    return np.stack([padded[i:i + x.shape[0]] for i in range(k)], axis=0)


def vertical_open(alpha, k):
    eroded = _shift_stack(alpha, k).min(axis=0)
    return _shift_stack(eroded, k).max(axis=0)


def whiten(src, dst, neutral_lo=12.0, neutral_hi=26.0, lum_lo=52.0, lum_hi=112.0,
           gain=1.35, open_k=0, keep_cols=None, blur=1.1):
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float64)
    spread = a.max(axis=2) - a.min(axis=2)
    lum = a @ np.array([0.2126, 0.7152, 0.0722])

    neutral = np.clip((neutral_hi - spread) / (neutral_hi - neutral_lo), 0.0, 1.0)
    bright = np.clip((lum - lum_lo) / (lum_hi - lum_lo), 0.0, 1.0)
    alpha = np.clip(neutral * bright * gain, 0.0, 1.0)

    if open_k:
        alpha = vertical_open(alpha, open_k)

    if keep_cols:
        lo, hi, feather = keep_cols
        keep = np.zeros(alpha.shape[1])
        keep[lo:hi] = 1.0
        ramp = np.linspace(0.0, 1.0, feather, endpoint=False)
        keep[lo - feather:lo] = ramp
        keep[hi:hi + feather] = ramp[::-1]
        alpha *= keep[None, :]

    alpha = np.asarray(
        Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    ).astype(np.float64) / 255.0

    out = a * alpha[..., None] + 255.0 * (1.0 - alpha[..., None])
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst)
    print(f'{dst}  kept {alpha.mean() * 100:.1f}%')


# The category pictures for the collection style strip ('collection-style-strip') are shot on
# white; two of the earring photographs came in on a dark studio backdrop and were put through
# this. What was run for those two, for the record:
#
#   python3 whiten-jewellery-backdrop.py dangles.png category-dangles-drops.png \
#       --open 15 --keep 548 1096
#   python3 whiten-jewellery-backdrop.py climbers.png category-climbers-jackets-cuffs.png \
#       --open 21 --keep 588 1012
#
# --keep is the column range the piece occupies, found by eye or from the ink-per-column profile.
# Everything outside it is cleared, which is what takes off the ends of a band running the width
# of the frame. Check the result at full size before uploading: the thresholds suit a bright
# piece on a warm backdrop and nothing else.
if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('src')
    parser.add_argument('dst')
    parser.add_argument('--open', type=int, default=0, dest='open_k',
                        help='height of the vertical opening, in pixels; 0 for none')
    parser.add_argument('--keep', type=int, nargs=2, metavar=('LO', 'HI'),
                        help='the only columns to keep')
    parser.add_argument('--feather', type=int, default=22)
    args = parser.parse_args()

    whiten(
        args.src,
        args.dst,
        open_k=args.open_k,
        keep_cols=(args.keep[0], args.keep[1], args.feather) if args.keep else None,
    )
