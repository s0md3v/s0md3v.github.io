import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class Memory {
    constructor(worldWidth = 1200, worldHeight = 800) {
        this.knownHostiles = []; 
        this.dangerZones = []; 
        this.distressSignals = new Map(); 
        this.socialCredit = new Map(); 
        this.detectionMeters = new Map(); 
        this.leaderApproval = 50; 
        this.discoveredCovers = new Set(); 
        this.knownLoot = []; 
        this.unreachableAreas = []; // {x, y, timestamp} 
        
        // PHYSICAL RESOLUTION: Keep intelligence 'vague' regardless of map size
        // One cell = Config.WORLD.INTEL_GRID_SIZE pixels (approx 75px)
        const cellRes = Config.WORLD.INTEL_GRID_SIZE;
        this.gridCols = Math.max(8, Math.floor(worldWidth / cellRes));
        this.gridRows = Math.max(8, Math.floor(worldHeight / cellRes));
        
        this.heatmap = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(0));
        this.controlMap = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(0)); // Friendly presence map
        this.hazardMap = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(0)); // Danger map (Explosions, Hazards)
        this.observedMap = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(0)); // Vision locking map
        this.obstacleMap = Array(this.gridRows).fill(-1).map(() => Array(this.gridCols).fill(-1));
        this.traumaLevel = 0; 

        // OPTIMIZATION: Reuse buffers to avoid per-frame GC pressure
        this._backHeat = Array(this.gridRows).fill(0).map(() => new Float32Array(this.gridCols));
        this._backControl = Array(this.gridRows).fill(0).map(() => new Float32Array(this.gridCols));
        
        // Convert existing maps to Float32Array for better performance
        this.heatmap = Array(this.gridRows).fill(0).map(() => new Float32Array(this.gridCols));
        this.controlMap = Array(this.gridRows).fill(0).map(() => new Float32Array(this.gridCols));
        this.observedMap = Array(this.gridRows).fill(0).map(() => new Float32Array(this.gridCols));

        this._lastDiffusionTime = Date.now() - Math.random() * 200;
        this._diffusionInterval = 200; // 5Hz is sufficient for passive updates
    }

    markObserved(gx, gy) {
        if (gx >= 0 && gx < this.gridCols && gy >= 0 && gy < this.gridRows) {
            this.observedMap[gy][gx] = Date.now();
        }
    }

    modifyLeaderApproval(amount) {
        this.leaderApproval = Math.max(0, Math.min(100, this.leaderApproval + amount));
    }

    decayHeatAt(gx, gy, multiplier, dt) {
        if (gx < 0 || gx >= this.gridCols || gy < 0 || gy >= this.gridRows) return;
        
        const baseDecay = 0.5 * (dt / 1000); 
        const totalDecay = baseDecay * multiplier;
        
        if (this.heatmap[gy][gx] > 0) {
            this.heatmap[gy][gx] = Math.max(0, this.heatmap[gy][gx] - totalDecay);
        }
    }

    decayControlAt(gx, gy, multiplier, dt) {
        if (gx < 0 || gx >= this.gridCols || gy < 0 || gy >= this.gridRows) return;
        
        const baseDecay = 0.5 * (dt / 1000); 
        const totalDecay = baseDecay * multiplier;
        
        if (this.controlMap[gy][gx] > 0) {
            this.controlMap[gy][gx] = Math.max(0, this.controlMap[gy][gx] - totalDecay);
        }
    }

    diffuseHeatmap(world, dt) {
        const now = Date.now();
        if (now - this._lastDiffusionTime < this._diffusionInterval) return;
        
        // Diffusion is a heavy per-agent cost, so we run it at a fixed 10Hz
        const realDt = now - this._lastDiffusionTime;
        this._lastDiffusionTime = now;
        
        const diffusionRate = Config.AI.HEATMAP.DIFFUSION_RATE * (realDt / 16.6); 
        const lossRate = Config.AI.HEATMAP.LOSS_RATE * (realDt / 16.6);     
        const cellRes = Config.WORLD.INTEL_GRID_SIZE;

        // 1. Prepare Back-Buffers (Fast Copy)
        for (let y = 0; y < this.gridRows; y++) {
            this._backHeat[y].set(this.heatmap[y]);
            this._backControl[y].set(this.controlMap[y]);
        }

        // Neighbors remain constant (8-neighbor Moore neighborhood)
        const neighbors = [
            {dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1},
            {dx: 1, dy: 1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}, {dx: -1, dy: -1}
        ];
        const validN = new Uint8Array(8);

        for (let y = 0; y < this.gridRows; y++) {
            const rowHeat = this.heatmap[y];
            const rowControl = this.controlMap[y];
            
            // Fast skip empty rows
            let rowEmpty = true;
            for (let x = 0; x < this.gridCols; x++) {
                if (rowHeat[x] > 0.01 || rowControl[x] > 0.01) {
                    rowEmpty = false;
                    break;
                }
            }
            if (rowEmpty) continue;

            for (let x = 0; x < this.gridCols; x++) {
                const heat = rowHeat[x];
                const control = rowControl[x];
                
                if (heat <= 0.01 && control <= 0.01) continue;

                const cx = (x + 0.5) * cellRes;
                const cy = (y + 0.5) * cellRes;
                
                // Clear from obstacles immediately
                if (world.isWallAt(cx, cy)) {
                    this._backHeat[y][x] = 0;
                    this._backControl[y][x] = 0;
                    continue;
                }

                const spreadAmount = heat * diffusionRate;
                const cSpreadAmount = control * diffusionRate;
                
                // Subtract spread and loss from current cell in back buffer
                this._backHeat[y][x] -= (spreadAmount + (heat * lossRate));
                this._backControl[y][x] -= (cSpreadAmount + (control * lossRate));

                // Find valid neighbors for distribution
                let validCount = 0;
                for (let i = 0; i < 8; i++) {
                    const nx = x + neighbors[i].dx;
                    const ny = y + neighbors[i].dy;
                    if (nx >= 0 && nx < this.gridCols && ny >= 0 && ny < this.gridRows) {
                        const ncx = (nx + 0.5) * cellRes;
                        const ncy = (ny + 0.5) * cellRes;
                        // Avoid diffusing into walls or currently observed spots
                        if (world.isWallAt(ncx, ncy)) continue;
                        if ((now - this.observedMap[ny][nx]) < 200) continue;

                        validN[validCount++] = i;
                    }
                }

                if (validCount > 0) {
                    // Redistribution logic: Total spread is divided only among UNBLOCKED cells.
                    // This means heat "flows" around corners and builds up at the edge of the vision cone.
                    const hShare = spreadAmount / validCount;
                    const cShare = cSpreadAmount / validCount;
                    for (let i = 0; i < validCount; i++) {
                        const n = neighbors[validN[i]];
                        this._backHeat[y + n.dy][x + n.dx] += hShare;
                        this._backControl[y + n.dy][x + n.dx] += cShare;
                    }
                } else {
                    // Nowhere to spread? (Surrounded by walls/vision) 
                    // Keep the heat in the current cell to maintain conservation.
                    this._backHeat[y][x] += spreadAmount;
                    this._backControl[y][x] += cSpreadAmount;
                }
            }
        }

        // 3. Commit (Apply clamping and write back)
        for (let y = 0; y < this.gridRows; y++) {
            for (let x = 0; x < this.gridCols; x++) {
                this.heatmap[y][x] = Math.max(0, Math.min(10, this._backHeat[y][x]));
                this.controlMap[y][x] = Math.max(0, Math.min(10, this._backControl[y][x]));
            }
        }
    }

    updateHeat(x, y, world, amount = 1, spread = true) {
        const cellX = Math.floor((x / world.width) * this.gridCols);
        const cellY = Math.floor((y / world.height) * this.gridRows);

        // Don't place heat inside walls
        if (world.isWallAt(x, y)) return;

        if (!spread) {
            if (cellX >= 0 && cellX < this.gridCols && cellY >= 0 && cellY < this.gridRows) {
                this.heatmap[cellY][cellX] = Math.min(10, this.heatmap[cellY][cellX] + amount);
            }
            return;
        }

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = cellX + dx;
                const ny = cellY + dy;
                if (nx >= 0 && nx < this.gridCols && ny >= 0 && ny < this.gridRows) {
                    // Check if neighbor is a wall
                    const tx = (nx + 0.5) * (world.width / this.gridCols);
                    const ty = (ny + 0.5) * (world.height / this.gridRows);
                    if (world.isWallAt(tx, ty)) continue;

                    const inc = (dx === 0 && dy === 0) ? amount : amount * 0.5;
                    this.heatmap[ny][nx] = Math.min(10, this.heatmap[ny][nx] + inc);
                }
            }
        }
    }

    updateControl(x, y, world, amount = 1) {
        const cellX = Math.floor((x / world.width) * this.gridCols);
        const cellY = Math.floor((y / world.height) * this.gridRows);

        // Don't place control inside walls
        if (world.isWallAt(x, y)) return;

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = cellX + dx;
                const ny = cellY + dy;
                if (nx >= 0 && nx < this.gridCols && ny >= 0 && ny < this.gridRows) {
                    // Check if neighbor is a wall
                    const tx = (nx + 0.5) * (world.width / this.gridCols);
                    const ty = (ny + 0.5) * (world.height / this.gridRows);
                    if (world.isWallAt(tx, ty)) continue;

                    const inc = (dx === 0 && dy === 0) ? amount : amount * 0.5;
                    this.controlMap[ny][nx] = Math.min(10, this.controlMap[ny][nx] + inc);
                }
            }
        }
    }

    updateHazard(x, y, world, amount = 1) {
        const cellX = Math.floor((x / world.width) * this.gridCols);
        const cellY = Math.floor((y / world.height) * this.gridRows);

        // Hazards spread a bit more (Explosions are unsafe area)
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const nx = cellX + dx;
                const ny = cellY + dy;
                if (nx >= 0 && nx < this.gridCols && ny >= 0 && ny < this.gridRows) {
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist <= 2) {
                         const inc = amount * (1 - dist/2.5);
                         this.hazardMap[ny][nx] = Math.min(100, this.hazardMap[ny][nx] + inc);
                    }
                }
            }
        }
    }



    modifyTrust(agentId, amount) {
        let current = this.socialCredit.get(agentId) || 0.5;
        this.socialCredit.set(agentId, Utils.clamp(current + amount, 0.1, 1.0));
    }

    updateDetection(agentId, amount) {
        let current = this.detectionMeters.get(agentId) || 0;
        this.detectionMeters.set(agentId, Math.max(0, Math.min(2.0, current + amount))); // Max 2.0 to allow some "retention" buffer
    }

    isSpotted(agentId) {
        return (this.detectionMeters.get(agentId) || 0) >= Config.SENSORY.DETECTION_THRESHOLD;
    }

    updateHostile(id, position, time, confidence = 1.0) {
        if (confidence < 0.4) return; // Ignore "Boy who cried wolf"

        const existing = this.knownHostiles.find(h => h.id === id);
        if (existing) {
            existing.lastKnownPosition = position;
            existing.timestamp = time;
            existing.isGhost = false; // Confirmed sighting
        } else {
            this.knownHostiles.push({ id, lastKnownPosition: position, timestamp: time, isGhost: false });
        }
    }

    updateDistressSignal(id, type, position, time, confidence = 1.0) {
        if (confidence < 0.5) return;
        this.distressSignals.set(id, { type, position, timestamp: time });
    }

    markUnreachable(pos) {
        this.unreachableAreas.push({ x: pos.x, y: pos.y, timestamp: Date.now() });
    }

    isUnreachable(pos) {
        // Check if close to any known unreachable point
        return this.unreachableAreas.some(u => Utils.distance(pos, u) < 40); 
    }

    verifyClear(pos, radius) {
        // If we looked at a spot and saw nothing, clear any ghosts there
        this.knownHostiles = this.knownHostiles.filter(h => {
             // Only clear ghosts (suspected), never clear active contacts (we clearly see them)
             // ... wait, if we see them, they aren't ghosts. 
             // If we don't see them, they ARE ghosts. 
             // So if h.isGhost is true, and we verify the spot is empty, delete.
             if (!h.isGhost) return true;
             
             const dist = Utils.distance(pos, h.lastKnownPosition);
             return dist > radius;
        });
    }

    cleanup(world, dt) {
        const now = Date.now();
        // Remove hostiles not seen for 10 seconds or that no longer exist in world
        // Object Permanence Update
        // 1. Mark stale contacts as Ghosts (Suspected)
        this.knownHostiles.forEach(h => {
            const timeSinceSeen = now - h.timestamp;
            if (timeSinceSeen > 2000 && !h.isGhost) {
                h.isGhost = true;
            }
        });

        // 2. Remove old Ghosts
        this.knownHostiles = this.knownHostiles.filter(h => {
            const timeSinceSeen = now - h.timestamp;
            const stillExists = world.agents.some(a => a.id === h.id);
            
            // Keep actual contacts for 30s (Ghosts), but strictly remove if agent is dead/gone from world
            // Exception: If we haven't seen them for 30s, we forget them.
            return stillExists && timeSinceSeen < 30000;
        });

        // Cleanup distress signals (5 seconds)
        for (const [id, signal] of this.distressSignals) {
            if (now - signal.timestamp > 5000) {
                this.distressSignals.delete(id);
            }
        }
        
        // Decay danger zones (Sounds) - Short memory (30s)
        this.dangerZones = this.dangerZones.filter(dz => (now - dz.timestamp) < 30000);

        // Cleanup unreachable areas (short term memory - 5s)
        this.unreachableAreas = this.unreachableAreas.filter(u => (now - u.timestamp) < 5000);

        // Decay detection meters
        const detectDecay = Config.SENSORY.DETECTION_DECAY * (dt / 1000);
        for (let [id, val] of this.detectionMeters) {
            if (val > 0) {
                const newVal = Math.max(0, val - detectDecay);
                if (newVal === 0) this.detectionMeters.delete(id);
                else this.detectionMeters.set(id, newVal);
            }
        }

        // Heatmap and ControlMap now use Uncertainty Diffusion instead of simple decay
        this.diffuseHeatmap(world, dt);

        // Decay hazardMap linearly
        const hazardDecay = 1.0 * (dt / 1000); // Slower decay so deaths remain dangerous longer

        for (let y = 0; y < this.gridRows; y++) {
            for (let x = 0; x < this.gridCols; x++) {
                if (this.hazardMap[y][x] > 0) {
                    this.hazardMap[y][x] = Math.max(0, this.hazardMap[y][x] - hazardDecay);
                }
            }
        }
    }
}
