#!/usr/bin/env python3
"""Make each section's link preview from its own thing on the desk.

Usage (from the repo root, with `jekyll serve` running):
    python3 scripts/make_share_cards.py [http://localhost:4000]

Requires Playwright (pip install playwright; playwright install chromium) and Pillow.
It opens the desk by day, waits for everything on it to be set down, and photographs
each section's object with its tape, writing assets/share/<section>.jpg at 1200x630.
The homepage's is the whole desk. Pages pick theirs up from their front matter's
`image:`. Re-run it after the desk changes; replace any of them with your own whenever.
"""
import io
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4000').rstrip('/')
OUT = os.path.join('assets', 'share')
W, H = 1200, 630
QUALITY = 84

# Section -> the desk object that leads to it
OBJECTS = {
    'about': '#about',
    'projects': '#projects',
    'blog': '#blog',
    'papers': '#papers',
    'philosophy': '#philosophy',
    'gallery': '#gallery',
    'taste': '#uses',
}

# Box around an element and its tape, in page pixels, cut to the window
BOX = '''sel => {
  const el = document.querySelector(sel);
  const rects = [el, ...el.querySelectorAll('.tag, .item, .lift')].map(e => e.getBoundingClientRect())
    .filter(r => r.width && r.height);
  const l = Math.min(...rects.map(r => r.left)), t = Math.min(...rects.map(r => r.top));
  const r = Math.max(...rects.map(r => r.right)), b = Math.max(...rects.map(r => r.bottom));
  // Only what's on the table: some things run off its edges
  return { l: Math.max(l, 0), t: Math.max(t, 0), r: Math.min(r, innerWidth), b: Math.min(b, innerHeight),
           vw: innerWidth, vh: innerHeight };
}'''


def save(png, path):
    img = Image.open(io.BytesIO(png)).convert('RGB').resize((W, H), Image.LANCZOS)
    img.save(path, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    print(path, os.path.getsize(path) // 1024, 'KB')


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # The desk at a wide window, by day, still
        page = browser.new_page(viewport={'width': 1600, 'height': 840}, device_scale_factor=2,
                                color_scheme='light', reduced_motion='reduce')
        page.goto(BASE + '/', wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.wait_for_timeout(2500)

        save(page.screenshot(), os.path.join(OUT, 'home.jpg'))

        for name, sel in OBJECTS.items():
            b = page.evaluate(BOX, sel)
            # The object with room around it, at the card's shape, kept on the table
            cx, cy = (b['l'] + b['r']) / 2, (b['t'] + b['b']) / 2
            # Closer in on one at the table's edge, which can't be centred
            room = 1.45 if b['r'] < b['vw'] - 1 else 1.05
            h = max((b['b'] - b['t']) * room, (b['r'] - b['l']) * room * H / W, 300)
            h = min(h, b['vh'])
            w = h * W / H
            if w > b['vw']:
                w, h = b['vw'], b['vw'] * H / W
            x = min(max(cx - w / 2, 0), b['vw'] - w)
            y = min(max(cy - h / 2, 0), b['vh'] - h)
            png = page.screenshot(clip={'x': x, 'y': y, 'width': w, 'height': h})
            save(png, os.path.join(OUT, f'{name}.jpg'))

        browser.close()


if __name__ == '__main__':
    main()
