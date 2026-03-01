
import os
import json
from PIL import Image

ROOT_DIR = '/home/som/git/s0md3v.github.io/playground/red-is-pain'
ASSETS_DIR = 'assets/tileset'
OUTPUT_FILE = os.path.join(ROOT_DIR, 'assets/AssetManifest.js')

# Detect base dimensions from a standard terrain tile
# New structure: assets/tileset/terrain/tile_0024_grass1.png
BASE_UNIT_SAMPLE = os.path.join(ROOT_DIR, 'assets/tileset/terrain/tile_0024_grass1.png')

if os.path.exists(BASE_UNIT_SAMPLE):
    with Image.open(BASE_UNIT_SAMPLE) as img:
        BASE_W, BASE_H = img.size
else:
    # Fallback to 64x64 if sample missing
    BASE_W, BASE_H = 64, 64

print(f"Base unit dimensions: {BASE_W}x{BASE_H}")

manifest = {}

# New categories based on the updated structure
categories = {
    'Terrain': 'assets/tileset/terrain',
    'Walls': 'assets/tileset/wall',
    'Cover': 'assets/tileset/cover',
    'Bushes': 'assets/tileset/bush',
    'Decoration': 'assets/tileset/deco'
}

for category, rel_path in categories.items():
    full_path = os.path.join(ROOT_DIR, rel_path)
    if not os.path.exists(full_path):
        print(f"Skipping {category}: {rel_path} not found")
        continue
    
    files = []
    # Use os.walk to be more thorough if needed, but categories are flat for now
    for f in sorted(os.listdir(full_path)):
        if f.lower().endswith(('.png', '.jpg', '.jpeg')):
            clean_path = os.path.join(rel_path, f)
            abs_path = os.path.join(ROOT_DIR, clean_path)
            
            try:
                with Image.open(abs_path) as img:
                    w, h = img.size
                    # Infer number of tiles (relative to base 64x64)
                    # We use round to handle slight variations if any
                    tiles_x = max(1, round(w / BASE_W))
                    tiles_y = max(1, round(h / BASE_H))
                    
                    files.append({
                        'path': clean_path,
                        'name': f,
                        'w': w,
                        'h': h,
                        'tiles_x': tiles_x,
                        'tiles_y': tiles_y
                    })
            except Exception as e:
                print(f"Error processing {f}: {e}")
    
    manifest[category] = files
    print(f"Added {len(files)} items to {category}")

# Include global metadata
# The editor expects this structure
data = {
    'base_w': BASE_W,
    'base_h': BASE_H,
    'categories': manifest
}

js_content = f"export const AssetManifest = {json.dumps(data, indent=4)};"

with open(OUTPUT_FILE, 'w') as f:
    f.write(js_content)

print(f"Generated {OUTPUT_FILE}")
