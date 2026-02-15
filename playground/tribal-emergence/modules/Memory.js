import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class Memory {
    constructor(worldWidth = 1200, worldHeight = 800) {
        this.knownHostiles = []; 
        this.dangerZones = []; 
        this.dreadZones = []; 
        this.distressSignals = new Map(); 
        this.socialCredit = new Map(); 
        this.detectionMeters = new Map(); 
        this.leaderApproval = 50; 
        this.discoveredCovers = new Set(); 
        this.knownLoot = []; 
        
        // PHYSICAL RESOLUTION: Keep intelligence 'vague' regardless of map size
        // One cell = Config.WORLD.INTEL_GRID_SIZE pixels (approx 75px)
        const cellRes = Config.WORLD.INTEL_GRID_SIZE;
        this.gridCols = Math.max(8, Math.floor(worldWidth / cellRes));
        this.gridRows = Math.max(8, Math.floor(worldHeight / cellRes));
        
        this.heatmap = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(0));
        this.obstacleMap = Array(this.gridRows).fill(-1).map(() => Array(this.gridCols).fill(-1));
        this.traumaLevel = 0; 
    }

    modifyLeaderApproval(amount) {
        this.leaderApproval = Math.max(0, Math.min(100, this.leaderApproval + amount));
    }

    updateHeat(x, y, world, amount = 1) {
        const cellX = Math.floor((x / world.width) * this.gridCols);
        const cellY = Math.floor((y / world.height) * this.gridRows);

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = cellX + dx;
                const ny = cellY + dy;
                if (nx >= 0 && nx < this.gridCols && ny >= 0 && ny < this.gridRows) {
                    const inc = (dx === 0 && dy === 0) ? amount : amount * 0.5;
                    this.heatmap[ny][nx] = Math.min(10, this.heatmap[ny][nx] + inc);
                }
            }
        }
    }

    syncHeatmap(otherHeatmap, confidence = 1.0) {
        if (confidence < 0.3) return; // Ignore low confidence intel

        // Knowledge is not additive: take the maximum awareness level for each cell
        for (let y = 0; y < this.gridRows; y++) {
            for (let x = 0; x < this.gridCols; x++) {
                // Diminished returns on untrusted heat
                const incomingHeat = (otherHeatmap[y] ? otherHeatmap[y][x] : 0) * confidence;
                this.heatmap[y][x] = Math.max(this.heatmap[y][x], incomingHeat);
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
        } else {
            this.knownHostiles.push({ id, lastKnownPosition: position, timestamp: time });
        }
    }

    updateDistressSignal(id, type, position, time, confidence = 1.0) {
        if (confidence < 0.5) return;
        this.distressSignals.set(id, { type, position, timestamp: time });
    }

    addDread(x, y, radius, time) {
        this.dreadZones.push({ x, y, radius, timestamp: time });
    }

    cleanup(world, dt) {
        const now = Date.now();
        // Remove hostiles not seen for 10 seconds or that no longer exist in world
        this.knownHostiles = this.knownHostiles.filter(h => {
            const stillExists = world.agents.some(a => a.id === h.id);
            const isFresh = (now - h.timestamp) < 10000;
            return stillExists && isFresh;
        });

        // Cleanup distress signals (5 seconds)
        for (const [id, signal] of this.distressSignals) {
            if (now - signal.timestamp > 5000) {
                this.distressSignals.delete(id);
            }
        }
        
        // Decay danger zones (Sounds) - Short memory (30s)
        this.dangerZones = this.dangerZones.filter(dz => (now - dz.timestamp) < 30000);

        // Decay dread zones (Death) - Long memory (60s)
        this.dreadZones = this.dreadZones.filter(dz => (now - dz.timestamp) < 60000);

        // Decay detection meters
        const detectDecay = Config.SENSORY.DETECTION_DECAY * (dt / 1000);
        for (let [id, val] of this.detectionMeters) {
            if (val > 0) {
                const newVal = Math.max(0, val - detectDecay);
                if (newVal === 0) this.detectionMeters.delete(id);
                else this.detectionMeters.set(id, newVal);
            }
        }

        // Decay heatmap
        const decayAmount = 0.5 * (dt / 1000); // 0.5 units per second
        for (let y = 0; y < this.gridRows; y++) {
            for (let x = 0; x < this.gridCols; x++) {
                if (this.heatmap[y][x] > 0) {
                    this.heatmap[y][x] = Math.max(0, this.heatmap[y][x] - decayAmount);
                }
            }
        }
    }
}
