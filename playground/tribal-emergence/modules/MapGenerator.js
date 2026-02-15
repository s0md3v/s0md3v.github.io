import { Utils } from './Utils.js';

export class MapGenerator {
    constructor(width, height, gridSize) {
        this.width = width;
        this.height = height;
        this.gridSize = gridSize;
        this.rows = Math.ceil(height / gridSize);
        this.cols = Math.ceil(width / gridSize);
    }

    generate() {
        let grid = [];
        // Initialize as empty
        for (let y = 0; y < this.rows; y++) {
            grid[y] = new Array(this.cols).fill(0);
        }

        // 1. Perimeter
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (x === 0 || x === this.cols - 1 || y === 0 || y === this.rows - 1) {
                    grid[y][x] = 1;
                }
            }
        }

        // 2. Procedural Pillar Placement (Mirrored for Fairness)
        // We divide the map into sectors and place a pillar in each with random offset
        const sectorSize = 8;
        const sectorsX = Math.floor(this.cols / sectorSize);
        const sectorsY = Math.floor(this.rows / sectorSize);

        for (let sy = 1; sectorsY > 2 && sy < sectorsY - 1; sy++) {
            // Only process left half and mirror to right
            for (let sx = 1; sx < Math.floor(sectorsX / 2); sx++) {
                // 40% chance to place a pillar in this sector
                if (Math.random() < 0.4) {
                    const jitterX = Math.floor(Math.random() * (sectorSize - 2));
                    const jitterY = Math.floor(Math.random() * (sectorSize - 2));
                    
                    const px = sx * sectorSize + jitterX;
                    const py = sy * sectorSize + jitterY;
                    
                    const pw = 2 + Math.floor(Math.random() * 3);
                    const ph = pw; // Square-ish pillars

                    this.addPillar(grid, px, py, pw, ph);
                    
                    // Mirror to right side
                    const mx = (this.cols - 1) - px - pw + 1;
                    this.addPillar(grid, mx, py, pw, ph);
                }
            }
        }

        // 3. Central Obstacle (Always different shape)
        const centerType = Math.random();
        const cx = Math.floor(this.cols / 2);
        const cy = Math.floor(this.rows / 2);
        
        if (centerType < 0.3) {
            // Large single hub
            this.addPillar(grid, cx, cy, 4, 4);
        } else if (centerType < 0.6) {
            // Vertical divider
            this.addPillar(grid, cx, cy - 4, 3, 4);
            this.addPillar(grid, cx, cy + 4, 3, 4);
        } else {
            // Horizontal split
            this.addPillar(grid, cx - 4, cy, 4, 3);
            this.addPillar(grid, cx + 4, cy, 4, 3);
        }

        // 4. Smooth slightly
        for (let i = 0; i < 1; i++) {
            grid = this.smooth(grid);
        }

        return grid;
    }

    addPillar(grid, x, y, w, h) {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (j >= 1 && j < this.rows - 1 && i >= 1 && i < this.cols - 1) {
                    grid[j][i] = 1;
                }
            }
        }
    }

    smooth(grid) {
        const newGrid = [];
        for (let y = 0; y < this.rows; y++) {
            newGrid[y] = [];
            for (let x = 0; x < this.cols; x++) {
                const neighbors = this.countNeighbors(grid, x, y);
                if (grid[y][x] === 1) {
                    newGrid[y][x] = neighbors >= 3 ? 1 : 0;
                } else {
                    // Very low chance to fill to keep it open
                    newGrid[y][x] = neighbors >= 5 ? 1 : 0;
                }
            }
        }
        return newGrid;
    }

    countNeighbors(grid, x, y) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
                    count++;
                } else if (grid[ny][nx] === 1) {
                    count++;
                }
            }
        }
        return count;
    }

    convertToWalls(grid) {
        const walls = [];
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (grid[y][x] === 1) {
                    walls.push({
                        x: x * this.gridSize,
                        y: y * this.gridSize,
                        w: this.gridSize,
                        h: this.gridSize
                    });
                }
            }
        }
        return walls;
    }
}
