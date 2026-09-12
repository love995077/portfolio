#!/usr/bin/env python3
"""
Cut the brand page's stills out of the film frames — re-framed crops, not
repeats of what the film already showed at full width. Costs nothing: every
image here is a crop of a frame that already shipped in frames/.

    python tools/build_stills.py

Frames are 1152x648 (16:9). Splits are cut to 3:2 and gallery tiles to 16:10
so they read as deliberate detail shots rather than film leftovers.
"""

import os

from PIL import Image

FRAMES = "frames"
OUT = "stills"

# (name, frame index, aspect w:h, horizontal centre as a fraction of width)
PLATES = [
    ("origin", 26, (3, 2), 0.55),   # the college workshop the story opens in
    ("craft", 200, (3, 2), 0.45),   # the ride along the lake
    ("g1", 380, (16, 10), 0.50),    # bike at the curb
    ("g2", 260, (16, 10), 0.50),    # the "Python SQL GenAI" sign
    ("g3", 620, (16, 10), 0.50),    # elevator HUD
    ("g4", 810, (16, 10), 0.50),    # the project panels
]


def crop(im, aspect, cx):
    W, H = im.size
    aw, ah = aspect
    # take the largest box of this aspect that still fits inside the frame
    w = min(W, int(H * aw / ah))
    h = min(H, int(w * ah / aw))
    x0 = int(cx * W - w / 2)
    x0 = max(0, min(W - w, x0))
    y0 = (H - h) // 2
    return im.crop((x0, y0, x0 + w, y0 + h))


def main():
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for name, idx, aspect, cx in PLATES:
        src = os.path.join(FRAMES, f"frame_{idx:04d}.webp")
        if not os.path.exists(src):
            raise SystemExit(f"missing frame: {src} — run build_master.py first")
        im = crop(Image.open(src).convert("RGB"), aspect, cx)
        dst = os.path.join(OUT, f"{name}.webp")
        im.save(dst, "WEBP", quality=86, method=6)
        size = os.path.getsize(dst)
        total += size
        print(f"  {name:<8} frame {idx:>4}  {im.size[0]}x{im.size[1]}  {size/1024:.0f} KB")
    print(f"\n{len(PLATES)} stills, {total/1024:.0f} KB total")


if __name__ == "__main__":
    main()
