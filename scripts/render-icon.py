#!/usr/bin/env python3
"""Render `assets/icon-180.png` from the artwork in `assets/icon.svg`.

Why this file exists
--------------------
Marketplaces that list this plugin only accept a **raster** icon hosted on
GitHub (`png`/`jpg`/`webp`); SVG is refused, and third-party image hosts are
refused too. `assets/icon.svg` is the source of truth for the artwork (the npm
`./icon` export still points at it), so the PNG is a render of that SVG rather
than a second, hand-edited drawing that would drift.

Pillow cannot read SVG, so the shapes are transcribed here. Keep this script in
sync when the SVG changes: the same 64-unit coordinate system is used, with a
supersampling factor so the strokes stay round at 180 px.

Usage: python scripts/render-icon.py
Requires: Pillow, numpy (both are only needed to regenerate the asset).
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# The SVG canvas is 64x64 units; every coordinate below is in that space.
UNIT = 64
SIZE = 180
SUPERSAMPLE = 4
SCALE = SIZE * SUPERSAMPLE / UNIT

# assets/icon.svg <linearGradient id="g">: #4d7cfe at (0,0) -> #8f5bff at (1,1).
GRADIENT_FROM = (0x4D, 0x7C, 0xFE)
GRADIENT_TO = (0x8F, 0x5B, 0xFF)

# assets/icon.svg <rect x="4" y="4" width="56" height="56" rx="14">.
PLATE_INSET = 4
PLATE_RADIUS = 14
STROKE = 4


def gradient(size: int) -> Image.Image:
    """Diagonal top-left to bottom-right gradient, same axis as the SVG."""
    axis = np.linspace(0.0, 1.0, size, dtype=np.float32)
    # t = ((x + y) / 2) normalised, which is the projection onto (1,1)/|(1,1)|.
    t = (axis[:, None] + axis[None, :]) / 2.0
    channels = []
    for start, end in zip(GRADIENT_FROM, GRADIENT_TO):
        channels.append(start + (end - start) * t)
    return Image.fromarray(np.stack(channels, axis=-1).astype(np.uint8), 'RGB')


def plate_mask(size: int) -> Image.Image:
    """Rounded-rectangle mask for the plate, in the supersampled space."""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    inset = round(PLATE_INSET * SCALE)
    draw.rounded_rectangle(
        (inset, inset, size - 1 - inset, size - 1 - inset),
        radius=round(PLATE_RADIUS * SCALE),
        fill=255,
    )
    return mask


def stroke_layer(size: int) -> Image.Image:
    """The white glyph as a greyscale coverage map (255 = fully white)."""
    layer = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(layer)
    width = round(STROKE * SCALE)

    def line(x1, y1, x2, y2, ink=255):
        # Every path in the SVG uses stroke-linecap="round".
        draw.line((x1, y1, x2, y2), fill=ink, width=width)
        for x, y in ((x1, y1), (x2, y2)):
            r = width / 2
            draw.ellipse((x - r, y - r, x + r, y + r), fill=ink)

    def arc(svg_center, start_deg, end_deg, ink):
        # The SVG stroke is centred on a 16-unit radius, so it spans 14..18.
        # Pillow thickens an arc inwards from its bounding box, so the box is
        # the OUTER edge (radius 18) and the width brings it back to 14.
        # `svg_center` is in SVG units like every other coordinate here.
        cx, cy = svg_center
        outer = (16 + STROKE / 2) * SCALE
        box = (cx * SCALE - outer, cy * SCALE - outer, cx * SCALE + outer, cy * SCALE + outer)
        draw.arc(box, start=start_deg, end=end_deg, fill=ink, width=width)

    def u(px, py):
        return px * SCALE, py * SCALE

    # M32 17 v13 — the shaft below the top arc.
    line(*u(32, 17), *u(32, 30))
    # M32 43 v4 — the tail above the bottom arc.
    line(*u(32, 43), *u(32, 47))
    # circle cx=32 cy=36 r=4.
    r = 4 * SCALE
    cx, cy = u(32, 36)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    # M20 24 a16 16 0 0 1 24 0 — centre at (32, 34.58), the top bulge, opacity .85.
    arc((32, 34.58), 221.4, 318.6, ink=round(255 * 0.85))
    # M44 44 a16 16 0 0 1 -24 0 — centre at (32, 33.42), the bottom bulge, opacity .55.
    arc((32, 33.42), 41.4, 138.6, ink=round(255 * 0.55))
    return layer


def main() -> None:
    size = SIZE * SUPERSAMPLE
    canvas = gradient(size)
    canvas.putalpha(plate_mask(size))
    glyph = stroke_layer(size)
    white = Image.new('RGB', (size, size), (255, 255, 255))
    canvas = Image.composite(white, canvas.convert('RGB'), glyph).convert('RGBA')
    canvas.putalpha(plate_mask(size))

    out = Path(__file__).resolve().parent.parent / 'assets' / 'icon-180.png'
    canvas.resize((SIZE, SIZE), Image.LANCZOS).save(out, optimize=True)
    print(f'wrote {out.relative_to(out.parent.parent.parent)} ({SIZE}x{SIZE})')


if __name__ == '__main__':
    main()
