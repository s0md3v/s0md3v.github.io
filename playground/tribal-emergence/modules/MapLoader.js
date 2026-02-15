
import { Config } from './Config.js';

export class MapLoader {
    constructor() {
        this.metaSize = Config.WORLD.GRID_SIZE; 
        this.visualSize = Config.WORLD.VISUAL_GRID_SIZE;
    }

    load(mapData) {
        if (!mapData || !mapData.layers) return null;

        const width = mapData.width * this.visualSize;
        const height = mapData.height * this.visualSize;
        
        // Output Structures
        const result = {
            width: width,
            height: height,
            walls: [],
            bushes: [],
            covers: [],
            spawns: [],
            grid: [], // 2D array for pathfinding
            visualLayers: [mapData.layers[0] || {}, mapData.layers[1] || {}]
        };

        // Grid resolution is now different from visual tile count
        const gridW = Math.ceil(width / this.metaSize);
        const gridH = Math.ceil(height / this.metaSize);
        for (let y = 0; y < gridH; y++) {
            result.grid[y] = new Array(gridW).fill(0);
        }

        // Tracking to prevent duplicate object creation for high-res grid
        const handledBushes = new Set();
        const handledCovers = new Set();

        // Process Meta Layer (Layer 2)
        const metaLayer = mapData.layers[2];
        if (metaLayer) {
            for (const [key, type] of Object.entries(metaLayer)) {
                const [gx, gy] = key.split(',').map(Number);
                const x = gx * this.metaSize;
                const y = gy * this.metaSize;

                if (gy >= result.grid.length || gx >= result.grid[0].length) continue;

                const vgx = Math.floor(x / this.visualSize);
                const vgy = Math.floor(y / this.visualSize);
                const visualKey = `${vgx},${vgy}`;

                if (type === 1) { // Wall
                    result.grid[gy][gx] = 1;
                    result.walls.push({ x, y, w: this.metaSize, h: this.metaSize });
                } else if (type === 2) { // Bush
                    result.grid[gy][gx] = 2; // Vision block
                    if (!handledBushes.has(visualKey)) {
                        result.bushes.push({ 
                            x: vgx * this.visualSize + this.visualSize/2, 
                            y: vgy * this.visualSize + this.visualSize/2, 
                            radius: this.visualSize * 0.7
                        });
                        handledBushes.add(visualKey);
                    }
                } else if (type === 3 || type === 4) { // Cover
                    result.grid[gy][gx] = type; 
                    if (!handledCovers.has(visualKey)) {
                        result.covers.push({
                            x: vgx * this.visualSize, 
                            y: vgy * this.visualSize, 
                            w: this.visualSize, 
                            h: this.visualSize,
                            hp: type === 4 ? Config.PHYSICS.COVER_HP_STONE : Config.PHYSICS.COVER_HP_WOOD,
                            maxHp: type === 4 ? Config.PHYSICS.COVER_HP_STONE : Config.PHYSICS.COVER_HP_WOOD
                        });
                        handledCovers.add(visualKey);
                    }
                } else if (type === 5) { // Spawn T1
                    result.spawns.push({ x: x + this.metaSize/2, y: y + this.metaSize/2, team: 0 });
                } else if (type === 6) { // Spawn T2
                    result.spawns.push({ x: x + this.metaSize/2, y: y + this.metaSize/2, team: 1 });
                }
            }
        }

        return result;
    }
}
