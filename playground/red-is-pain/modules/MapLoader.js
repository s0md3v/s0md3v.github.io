
import { Config } from './Config.js?v=field-console-14';
import { Utils } from './Utils.js?v=field-console-14';

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
            visualLayers: [mapData.layers[0] || {}, mapData.layers[1] || {}, this.getVisualEntries(mapData.layers[2])]
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

                const shape = this.normalizeShape(v);
                if (!shape) return;
                
                // Determine Type
                const tag = shape.tag || shape.type || 'wall';
                
                if (tag.includes('wall')) {
                    result.walls.push(shape);
                    this.rasterizeShape(result.grid, shape, 1, gridSize); // 1 = Wall/Block
                } else if (tag.includes('cover')) {
                    result.covers.push({
                        ...shape,
                        hp: Config.PHYSICS.COVER_HP_STONE,
                        maxHp: Config.PHYSICS.COVER_HP_STONE
                    });
                    this.rasterizeShape(result.grid, shape, 3, gridSize); // 3 = Cover
                } else if (tag.includes('bush')) {
                    result.bushes.push(shape);
                    // Bushes don't block movement (0), but block vision? 
                    // Verify grid logic. Usually bushes are handled separately.
                    // If grid value 2 is "Vision Block but Walkable", use that.
                    this.rasterizeShape(result.grid, shape, 2, gridSize);
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

    getVisualEntries(layer) {
        if (!layer || Array.isArray(layer)) return {};
        return Object.fromEntries(Object.entries(layer).filter(([, value]) => {
            return typeof value === 'string' || (value && typeof value === 'object' && typeof value.path === 'string');
        }));
    }

    normalizeShape(shape) {
        const points = shape.points
            .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
            .map(point => ({ x: point.x, y: point.y }));
        if (points.length < 2) return null;

        const minX = Math.min(...points.map(point => point.x));
        const maxX = Math.max(...points.map(point => point.x));
        const minY = Math.min(...points.map(point => point.y));
        const maxY = Math.max(...points.map(point => point.y));
        const distinctPoints = new Set(points.map(point => `${point.x},${point.y}`));
        if (distinctPoints.size < 2) return null;

        const isPolygon = Boolean(shape.closed) && distinctPoints.size >= 3;
        const isBush = String(shape.tag || '').includes('bush');
        const thickness = Number.isFinite(shape.thickness)
            ? Math.max(Config.WORLD.GRID_SIZE, shape.thickness)
            : (isBush ? 10 : 6);
        const padding = isPolygon ? 0 : thickness / 2;
        const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
        const bounds = {
            x: minX - padding,
            y: minY - padding,
            w: Math.max(thickness, maxX - minX + padding * 2),
            h: Math.max(thickness, maxY - minY + padding * 2)
        };

        return {
            ...shape,
            points,
            closed: isPolygon,
            geometryType: isPolygon ? 'polygon' : 'polyline',
            thickness,
            x: isBush ? center.x : bounds.x,
            y: isBush ? center.y : bounds.y,
            w: bounds.w,
            h: bounds.h,
            center,
            ...(isBush ? { radius: Math.max(bounds.w, bounds.h) / 2 } : {})
        };
    }

    rasterizeShape(grid, shape, value, gridSize) {
        if (shape.closed) {
            Utils.rasterizePolygon(grid, shape.points, value, gridSize);
        } else {
            Utils.rasterizePolyline(grid, shape.points, value, gridSize, shape.thickness);
        }
    }
}
