#!/usr/bin/env python3
"""Generate resized WebP thumbnails for the gallery (/gallery).

Usage (from the repo root, after adding photos to assets/photos/):
    python3 scripts/make_thumbs.py .

Requires Pillow (pip install Pillow). For every assets/photos/<n>.webp it writes
assets/photos/thumbs/<n>-200.webp, <n>-400.webp and <n>-800.webp: pages/gallery.html
serves the 400 and 800 through srcset, and the homepage's camera shows the 200 in its
index and the 400 on its screen. Thumbnails newer than their source are left alone, so
re-running it only processes new or changed photos.
"""
import glob
import os
import sys

from PIL import Image, ImageOps

WIDTHS = (200, 400, 800)
QUALITY = 78

root = sys.argv[1] if len(sys.argv) > 1 else '.'
src_dir = os.path.join(root, 'assets', 'photos')
out_dir = os.path.join(src_dir, 'thumbs')
if not os.path.isdir(src_dir):
    sys.exit(f'{src_dir} not found; pass the repo root, e.g. python3 scripts/make_thumbs.py .')
os.makedirs(out_dir, exist_ok=True)

made = skipped = 0
for src in sorted(glob.glob(os.path.join(src_dir, '*.webp'))):
    name = os.path.splitext(os.path.basename(src))[0]
    src_mtime = os.path.getmtime(src)
    todo = []
    for w in WIDTHS:
        dst = os.path.join(out_dir, f'{name}-{w}.webp')
        if os.path.exists(dst) and os.path.getmtime(dst) >= src_mtime:
            skipped += 1
        else:
            todo.append((w, dst))
    if not todo:
        continue

    with Image.open(src) as im:
        icc = im.info.get('icc_profile')
        im = ImageOps.exif_transpose(im)
        if im.mode not in ('RGB', 'RGBA'):
            im = im.convert('RGB')
        for w, dst in todo:
            if im.width > w:
                out = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            else:
                out = im
            kw = dict(quality=QUALITY, method=6)
            if icc:
                kw['icc_profile'] = icc
            out.save(dst, 'WEBP', **kw)
            made += 1
            print(f'{dst}: {out.width}x{out.height}, {os.path.getsize(dst)} B')

print(f'{made} thumbnail(s) written, {skipped} already up to date')
