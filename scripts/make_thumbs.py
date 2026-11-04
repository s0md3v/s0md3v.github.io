#!/usr/bin/env python3
"""Generate resized thumbnails, and each photo's colour, for the gallery (/gallery).

Usage (from the repo root, after adding photos to assets/photos/):
    python3 scripts/make_thumbs.py .

Requires Pillow 11.3 or later, for AVIF (pip install Pillow). For every
assets/photos/<n>.webp it writes, in assets/photos/thumbs/:
  - <n>-200.avif, <n>-400.avif, <n>-600.avif and <n>-800.avif
  - for a wide photo (wide in _data/gallery.json, or landscape, as the gallery builder
    takes it), <n>-1200.avif too, so on a phone or a 2x screen its wide tile doesn't
    need the original
AVIF only: every current browser has it, and one that doesn't gets the original.
pages/gallery.html serves the 400 to 1200 through srcset, and only the viewer fetches
the original. The homepage's camera shows the 200 in its index and the 400 on its
screen.

It also writes _data/photo_tones.json, each photo's average colour by filename: a
gallery tile is that colour until its photo's here.

Thumbnails newer than their source are left alone, so re-running it only processes
new or changed photos.
"""
import glob
import json
import os
import sys

from PIL import Image, ImageOps

WIDTHS = (200, 400, 600, 800)
WIDE = 1200
QUALITY = 55

root = sys.argv[1] if len(sys.argv) > 1 else '.'
src_dir = os.path.join(root, 'assets', 'photos')
out_dir = os.path.join(src_dir, 'thumbs')
if not os.path.isdir(src_dir):
    sys.exit(f'{src_dir} not found; pass the repo root, e.g. python3 scripts/make_thumbs.py .')
os.makedirs(out_dir, exist_ok=True)

try:
    with open(os.path.join(root, '_data', 'gallery.json')) as f:
        wide = {p['filename'] for p in json.load(f) if p.get('is_wide')}
except FileNotFoundError:
    wide = set()

tones_path = os.path.join(root, '_data', 'photo_tones.json')
try:
    with open(tones_path) as f:
        tones = json.load(f)
except FileNotFoundError:
    tones = {}
was = dict(tones)

made = skipped = 0
sources = sorted(glob.glob(os.path.join(src_dir, '*.webp')))
for src in sources:
    filename = os.path.basename(src)
    name = os.path.splitext(filename)[0]
    src_mtime = os.path.getmtime(src)
    with Image.open(src) as im:
        widths = WIDTHS + ((WIDE,) if filename in wide or im.width > 1.2 * im.height else ())
    todo = []
    for w in widths:
        dst = os.path.join(out_dir, f'{name}-{w}.avif')
        if os.path.exists(dst) and os.path.getmtime(dst) >= src_mtime:
            skipped += 1
        else:
            todo.append((w, dst))
    if not todo and filename in tones:
        continue

    with Image.open(src) as im:
        icc = im.info.get('icc_profile')
        im = ImageOps.exif_transpose(im)
        if im.mode not in ('RGB', 'RGBA'):
            im = im.convert('RGB')
        # Its average colour, as it'd be blurred all over
        r, g, b = im.convert('RGB').reduce(8).resize((1, 1), Image.BOX).getpixel((0, 0))
        tones[filename] = f'#{r:02x}{g:02x}{b:02x}'
        for w, dst in todo:
            if im.width > w:
                out = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            else:
                out = im
            kw = dict(quality=QUALITY, speed=4)
            if icc:
                kw['icc_profile'] = icc
            # Written aside and then put in place, so a running jekyll serve never copies half of one
            part = os.path.join(out_dir, '.' + os.path.basename(dst))
            out.save(part, 'AVIF', **kw)
            os.replace(part, dst)
            made += 1
            print(f'{dst}: {out.width}x{out.height}, {os.path.getsize(dst)} B')

# Only the photos there are, in their order
names = {os.path.basename(s) for s in sources}
tones = dict(sorted(((k, v) for k, v in tones.items() if k in names),
                    key=lambda kv: (len(kv[0]), kv[0])))
if tones != was or list(tones) != list(was):
    with open(tones_path, 'w') as f:
        json.dump(tones, f, indent=4)
        f.write('\n')
    print(f'{tones_path}: {len(tones)} colours')

print(f'{made} thumbnail(s) written, {skipped} already up to date')
