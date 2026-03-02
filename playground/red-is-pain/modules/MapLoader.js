
import { Config } from './Config.js';
import { Utils } from './Utils.js';

export class MapLoader {
    constructor() {
        this.metaSize = Config.WORLD.GRID_SIZE; 
        this.visualSize = Config.WORLD.VISUAL_GRID_SIZE;
    }

    load(mapData) {
        if (!mapData || !mapData.layers) return null;

        const width = mapData.width * Config.WORLD.TILE_SIZE; // 16px tiles
        const height = mapData.height * Config.WORLD.TILE_SIZE;
        
        // Output Structures
        const result = {
            width: width,
            height: height,
            walls: [],      // Physical walls (Rects or Polys)
            bushes: [],     // Hiding zones
            covers: [],     // Low obstacles
            spawns: [],
            grid: [],       // 2D array for pathfinding/vision (4px resolution)
            visualLayers: [mapData.layers[0] || {}, mapData.layers[1] || {}, mapData.layers[2] || {}]
        };

        // Grid resolution (4px per cell by default in Config)
        const gridSize = Config.WORLD.GRID_SIZE; 
        const gridW = Math.ceil(width / gridSize);
        const gridH = Math.ceil(height / gridSize);
        
        // Initialize Grid
        for (let y = 0; y < gridH; y++) {
            result.grid[y] = new Array(gridW).fill(0);
        }

        // --- Layer 2: Legacy Decorations / Meta (Optional Backward Comp) ---
        // keeping for old maps, but new editor uses L3/L4
        const metaLayer = mapData.layers[2];
        if (metaLayer && !Array.isArray(metaLayer)) {
            for (const [key, type] of Object.entries(metaLayer)) {
               // ... (Legacy handling if needed, or skip if migrated)
               // The editor migrates this, so we can likely ignore or minimal support
            }
        }

        // --- Layer 3: Vector Collisions ---
        const vectors = mapData.layers[3];
        if (vectors && Array.isArray(vectors)) {
            vectors.forEach(v => {
                if (!v || !v.points) return;
                
                // Determine Type
                const tag = v.tag || v.type || 'wall';
                
                if (tag.includes('wall')) {
                    result.walls.push(v);
                    Utils.rasterizePolygon(result.grid, v.points, 1, gridSize); // 1 = Wall/Block
                } else if (tag.includes('cover')) {
                    result.covers.push({
                        ...v,
                        hp: Config.PHYSICS.COVER_HP_STONE,
                        maxHp: Config.PHYSICS.COVER_HP_STONE
                    });
                    Utils.rasterizePolygon(result.grid, v.points, 3, gridSize); // 3 = Cover
                } else if (tag.includes('bush')) {
                    result.bushes.push(v);
                    // Bushes don't block movement (0), but block vision? 
                    // Verify grid logic. Usually bushes are handled separately.
                    // If grid value 2 is "Vision Block but Walkable", use that.
                    Utils.rasterizePolygon(result.grid, v.points, 2, gridSize); 
                }
            });
        }

        // --- Layer 4: Spawns ---
        const spawns = mapData.layers[4];
        if (spawns) {
            for (const [key, data] of Object.entries(spawns)) {
                const [gx, gy] = key.split(',').map(Number);
                // Grid coords from editor are 16px based usually
                // But editor sends x,y which are tile coords (integers)
                // So world pos = x * 16, y * 16
                const tileSize = Config.WORLD.TILE_SIZE;
                const x = gx * tileSize + tileSize/2;
                const y = gy * tileSize + tileSize/2;
                
                if (data.spawnType === 5) {
                    result.spawns.push({ x, y, team: 0 }); // T1
                } else if (data.spawnType === 6) {
                    result.spawns.push({ x, y, team: 1 }); // T2
                }
            }
        }
        
        // If no spawns found, fallback (or random)
        if (result.spawns.length === 0) {
             console.warn("No spawns found in map data.");
        }

        return result;
    }
}
