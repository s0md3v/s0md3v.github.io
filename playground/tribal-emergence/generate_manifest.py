
import os
import json
from PIL import Image

ROOT_DIR = '/home/som/git/s0md3v.github.io/playground/tribal-emergence'
ASSETS_DIR = 'assets/tileset'
OUTPUT_FILE = '/home/som/git/s0md3v.github.io/playground/tribal-emergence/assets/AssetManifest.js'

# Get base dimensions from the barrel
BASE_UNIT_PATH = os.path.join(ROOT_DIR, 'assets/tileset/Crates Barrels/TDS04_0016_Barrel.png')
with Image.open(BASE_UNIT_PATH) as img:
    BASE_W, BASE_H = img.size

print(f"Base unit dimensions: {BASE_W}x{BASE_H}")

manifest = {}

# categories to scan
categories = {
    'Terrain_Grass': 'assets/tileset/Tileset_v2/Tiles/Grass',
    'Terrain_Dirt': 'assets/tileset/Tileset_v2/Tiles/Dirt',
    'Terrain_Sand': 'assets/tileset/Tileset_v2/Tiles/Sand',
    'Terrain_Asphalt': 'assets/tileset/Tileset_v2/Tiles/Asphalt',
    'Terrain_Water': 'assets/tileset/Tileset_v2/Tiles/Water',
    'Objects_Crates': 'assets/tileset/Crates Barrels',
    'Objects_House': 'assets/tileset/House',
    'Objects_Rocks': 'assets/tileset/Rocks',
    'Objects_Sandbags': 'assets/tileset/SandBag',
    'Objects_Trees': 'assets/tileset/Trees Bushes',
    'Objects_Walls': 'assets/tileset/Tiles'
}

for category, rel_path in categories.items():
    full_path = os.path.join(ROOT_DIR, rel_path)
    if not os.path.exists(full_path):
        continue
    
    files = []
    for f in sorted(os.listdir(full_path)):
        if f.lower().endswith(('.png', '.jpg', '.jpeg')):
            clean_path = os.path.join(rel_path, f)
            abs_path = os.path.join(ROOT_DIR, clean_path)
            
            try:
                with Image.open(abs_path) as img:
                    w, h = img.size
                    # Infer number of tiles
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

# Include global metadata
data = {
    'base_w': BASE_W,
    'base_h': BASE_H,
    'categories': manifest
}

js_content = f"export const AssetManifest = {json.dumps(data, indent=4)};"

with open(OUTPUT_FILE, 'w') as f:
    f.write(js_content)

print(f"Generated AssetManifest.js with metadata.")
