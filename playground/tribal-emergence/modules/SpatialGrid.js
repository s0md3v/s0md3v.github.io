export class SpatialGrid {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Map(); // Key: "x,y", Value: Set<Entity>
    }

    clear() {
        this.grid.clear();
    }

    getKey(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        // Use an integer key: (y << 16) | x
        // Assumes map size < 65536 cells in either dimension, which is plenty
        return (cy << 16) | cx;
    }

    // Add entity to all cells it touches
    add(entity) {
        const startX = Math.floor((entity.pos.x - (entity.radius || 10)) / this.cellSize);
        const startY = Math.floor((entity.pos.y - (entity.radius || 10)) / this.cellSize);
        const endX = Math.floor((entity.pos.x + (entity.radius || 10)) / this.cellSize);
        const endY = Math.floor((entity.pos.y + (entity.radius || 10)) / this.cellSize);

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                const key = (y << 16) | x;
                let cell = this.grid.get(key);
                if (!cell) {
                    cell = new Set();
                    this.grid.set(key, cell);
                }
                cell.add(entity);
            }
        }
    }

    // Query entities within radius of x,y
    // Returning an array for compatibility but we could optimize this further later
    query(x, y, radius) {
        const startX = Math.floor((x - radius) / this.cellSize);
        const startY = Math.floor((y - radius) / this.cellSize);
        const endX = Math.floor((x + radius) / this.cellSize);
        const endY = Math.floor((y + radius) / this.cellSize);

        const results = []; // Use array directly to avoid Set overhead if results are small

        for (let cy = startY; cy <= endY; cy++) {
            for (let cx = startX; cx <= endX; cx++) {
                const key = (cy << 16) | cx;
                const cell = this.grid.get(key);
                if (cell) {
                    for (const entity of cell) {
                        // Avoid duplicates if entity spans multiple cells
                        if (!results.includes(entity)) {
                            results.push(entity);
                        }
                    }
                }
            }
        }
        return results;
    }

    // Just get nearest neighbors directly
    getNeighbors(entity, radius) {
        return this.query(entity.pos.x, entity.pos.y, radius).filter(e => e !== entity);
    }
}
