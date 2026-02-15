import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class Memory {
    constructor() {
        this.knownHostiles = []; // { id, lastKnownPosition: {x, y}, timestamp }
        this.dangerZones = []; // { x, y, intensity, timestamp }
        this.dreadZones = []; // { x, y, radius, timestamp } - Where allies died
        this.distressSignals = new Map(); // AgentID -> { type, position, timestamp }
        this.socialCredit = new Map(); // AgentID -> float (trust)
        this.detectionMeters = new Map(); // AgentID -> float (0-1)
        this.leaderApproval = 50; // 0-100, starts neutral
        this.discoveredCovers = new Set(); // Set of cover objects seen
        this.knownLoot = []; // { x, y, type, timestamp }
        
        // 16x16 Spatial Heatmap
        this.gridSize = 16;
        this.heatmap = Array(16).fill(0).map(() => Array(16).fill(0));
        this.obstacleMap = Array(16).fill(-1).map(() => Array(16).fill(-1)); // -1: unknown, 0: walk, 1: wall
        this.traumaLevel = 0; // Cumulative permanent stress
    }

    modifyLeaderApproval(amount) {
        this.leaderApproval = Math.max(0, Math.min(100, this.leaderApproval + amount));
    }

    updateHeat(x, y, world, amount = 1) {
        const cellX = Math.floor((x / world.width) * this.gridSize);
        const cellY = Math.floor((y / world.height) * this.gridSize);

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = cellX + dx;
                const ny = cellY + dy;
                if (nx >= 0 && nx < this.gridSize && ny >= 0 && ny < this.gridSize) {
                    const inc = (dx === 0 && dy === 0) ? amount : amount * 0.5;
                    this.heatmap[ny][nx] = Math.min(10, this.heatmap[ny][nx] + inc);
                }
            }
        }
    }

    syncHeatmap(otherHeatmap, confidence = 1.0) {
        if (confidence < 0.3) return; // Ignore low confidence intel

        // Knowledge is not additive: take the maximum awareness level for each cell
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                // Diminished returns on untrusted heat
                const incomingHeat = otherHeatmap[y][x] * confidence;
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
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                if (this.heatmap[y][x] > 0) {
                    this.heatmap[y][x] = Math.max(0, this.heatmap[y][x] - decayAmount);
                }
            }
        }
    }
}
