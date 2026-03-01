import { Config } from './Config.js';
import { PriorityQueue, Utils } from './Utils.js';

export class Pathfinder {
    constructor(world) {
        this.world = world;
    }

    findPath(startPos, endPos, heatmap = null, preferStealth = false, hazardMap = null) {
        const step = Config.WORLD.PATHFINDING_GRID_SIZE; // 4px
        const width = this.world.width;
        const height = this.world.height;
        const cols = Math.ceil(width / step);
        const rows = Math.ceil(height / step);
        const size = cols * rows;

        const startNodeX = Math.floor(startPos.x / step);
        const startNodeY = Math.floor(startPos.y / step);
        const endNodeX = Math.floor(endPos.x / step);
        const endNodeY = Math.floor(endPos.y / step);

        if (startNodeX < 0 || startNodeX >= cols || startNodeY < 0 || startNodeY >= rows) return [];
        if (endNodeX < 0 || endNodeX >= cols || endNodeY < 0 || endNodeY >= rows) return [];
        if (startNodeX === endNodeX && startNodeY === endNodeY) return [endPos];
        
        // Ensure destination is actually reachable
        if (this.world.isWallAt(endPos.x, endPos.y)) {
             // Try to find nearest walkable neighbor
             const walkables = [];
             for(let dy=-1; dy<=1; dy++) {
                 for(let dx=-1; dx<=1; dx++) {
                     const nx = endPos.x + dx*step;
                     const ny = endPos.y + dy*step;
                     if (!this.world.isWallAt(nx, ny)) walkables.push({x: nx, y: ny});
                 }
             }
             if (walkables.length === 0) return [];
             // Just use the first one for now
             endPos = walkables[0];
        }

        const cameFrom = new Int32Array(size).fill(-1);
        const gScore = new Float32Array(size).fill(Infinity);
        const fScore = new Float32Array(size).fill(Infinity);
        const closedSet = new Uint8Array(size);

        const startIndex = startNodeY * cols + startNodeX;
        gScore[startIndex] = 0;
        fScore[startIndex] = this.heuristic(startNodeX, startNodeY, endNodeX, endNodeY);

        const openSet = new PriorityQueue((a, b) => fScore[a] - fScore[b]);
        openSet.push(startIndex);

        let iterations = 0;
        const maxIterations = 50000; 

        let closestIndex = startIndex;
        let minHeuristic = fScore[startIndex];

        const neighborDeltas = [
            {x: -1, y: 0}, {x: 1, y: 0}, {x: 0, y: -1}, {x: 0, y: 1},
            {x: -1, y: -1}, {x: 1, y: -1}, {x: -1, y: 1}, {x: 1, y: 1}
        ];
        const neighborCosts = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];

        while (openSet.size() > 0) {
            if (++iterations > maxIterations) break;

            const current = openSet.pop();
            if (closedSet[current]) continue;
            closedSet[current] = 1;

            const cx = current % cols;
            const cy = Math.floor(current / cols);

            if (cx === endNodeX && cy === endNodeY) {
                return this.reconstructPathFlat(cameFrom, current, cols, step);
            }

            const h = this.heuristic(cx, cy, endNodeX, endNodeY);
            if (h < minHeuristic) {
                minHeuristic = h;
                closestIndex = current;
            }

            for (let i = 0; i < 8; i++) {
                const nx = cx + neighborDeltas[i].x;
                const ny = cy + neighborDeltas[i].y;
                
                if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                const neighborIndex = ny * cols + nx;
                if (closedSet[neighborIndex]) continue;

                const wx = nx * step + step/2;
                const wy = ny * step + step/2;
                
                // 1. HARD BLOCK CHECK (Multiple samples for thin walls)
                // We check the center and the corners of the 4x4 node area
                const q = step * 0.4;
                if (this.world.isWallAt(wx, wy) || 
                    this.world.isWallAt(wx - q, wy - q) || 
                    this.world.isWallAt(wx + q, wy - q) || 
                    this.world.isWallAt(wx - q, wy + q) || 
                    this.world.isWallAt(wx + q, wy + q)) continue;

                // 2. BODY CLEARANCE
                // Extra buffer to prevent "scraping" against walls
                if (!this.world.isPositionClear(wx, wy, Config.AGENT.RADIUS + 1.5)) continue;

                // 3. MIDPOINT CHECK (Deep tunneling prevention)
                const cwx = cx * step + step/2;
                const cwy = cy * step + step/2;
                const mx = (cwx + wx) / 2;
                const my = (cwy + wy) / 2;
                if (this.world.isWallAt(mx, my)) continue;

                // 4. DIAGONAL SAFETY
                if (i >= 4) { 
                    const v1x = cwx + (neighborDeltas[i].x * step);
                    const v1y = cwy;
                    const v2x = cwx;
                    const v2y = cwy + (neighborDeltas[i].y * step);
                    if (this.world.isWallAt(v1x, v1y) || this.world.isWallAt(v2x, v2y)) continue;
                }

                let extraCost = 0;
                
                // Proximity Penalty (Stronger)
                if (!this.world.isPositionClear(wx, wy, Config.AGENT.RADIUS + 12)) {
                    extraCost += 1.5;
                }

                if (heatmap) {
                    const hRows = heatmap.length;
                    const hCols = heatmap[0].length;
                    const hx = Math.floor((wx / width) * hCols);
                    const hy = Math.floor((wy / height) * hRows);
                    if (hx >= 0 && hx < hCols && hy >= 0 && hy < hRows) {
                         extraCost += heatmap[hy][hx] * 40;
                    }
                }
                
                if (hazardMap) {
                    const hrRows = hazardMap.length;
                    const hrCols = hazardMap[0].length;
                    const hx = Math.floor((wx / width) * hrCols);
                    const hy = Math.floor((wy / height) * hrRows);
                    if (hx >= 0 && hx < hrCols && hy >= 0 && hy < hrRows) {
                         // Very high penalty for moving through a known hazard/fatal funnel
                         extraCost += hazardMap[hy][hx] * 200; 
                    }
                }

                const tentativeG = gScore[current] + neighborCosts[i] + extraCost;
                if (tentativeG < gScore[neighborIndex]) {
                    cameFrom[neighborIndex] = current;
                    gScore[neighborIndex] = tentativeG;
                    fScore[neighborIndex] = tentativeG + this.heuristic(nx, ny, endNodeX, endNodeY);
                    openSet.push(neighborIndex);
                }
            }
        }

        if (closestIndex !== startIndex && iterations > 1) {
            return this.reconstructPathFlat(cameFrom, closestIndex, cols, step);
        }
        return [];
    }

    reconstructPathFlat(cameFrom, current, cols, step) {
        const path = [];
        let curr = current;
        while (curr !== -1) {
            path.push({
                x: (curr % cols) * step + step / 2,
                y: Math.floor(curr / cols) * step + step / 2
            });
            curr = cameFrom[curr];
        }
        path.reverse();

        if (path.length > 2) {
            const newPath = [path[0]];
            let bookmark = 0;
            for (let i = 1; i < path.length; i++) {
                const p1 = path[bookmark];
                const p2 = path[i];
                if (!this.world.hasLineOfSight(p1, p2)) {
                    newPath.push(path[i-1]);
                    bookmark = i - 1;
                } else {
                     const dist = Utils.distance(p1, p2);
                     if (dist > Config.AGENT.RADIUS * 2) {
                        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                        const perp = angle + Math.PI/2;
                        const r = Config.AGENT.RADIUS + 4; // Thick smoothing raycast
                        const p1L = { x: p1.x + Math.cos(perp)*r, y: p1.y + Math.sin(perp)*r };
                        const p2L = { x: p2.x + Math.cos(perp)*r, y: p2.y + Math.sin(perp)*r };
                        const p1R = { x: p1.x - Math.cos(perp)*r, y: p1.y - Math.sin(perp)*r };
                        const p2R = { x: p2.x - Math.cos(perp)*r, y: p2.y - Math.sin(perp)*r };
                        
                         if (!this.world.hasLineOfSight(p1L, p2L) || !this.world.hasLineOfSight(p1R, p2R)) {
                            newPath.push(path[i-1]);
                            bookmark = i - 1;
                         }
                     }
                }
            }
            newPath.push(path[path.length-1]);
            return newPath;
        }
        return path;
    }

    heuristic(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        return (dx + dy) + (0.414) * Math.min(dx, dy); 
    }
}
