import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class Sensory {
    constructor(agent) {
        this.agent = agent;
    }

    scan(world) {
        const seen = [];
        const fov = Config.AGENT.FOV;
        const range = Config.AGENT.VISION_RADIUS;
        const dt = 16.6; // Approximated dt if not available, ideally passed from update

        // 1. Scan Agents using Spatial Grid
        const potentialTargets = world.spatial.query(this.agent.pos.x, this.agent.pos.y, range);
        
        for (const other of potentialTargets) {
            if (other === this.agent || other.isCover) continue; 
            
            const dist = Utils.distance(this.agent.pos, other.pos);
            if (dist > range) continue;

            const angleTo = Utils.angle(this.agent.pos, other.pos);
            let angleDiff = Math.abs(Utils.angleDiff(this.agent.angle, angleTo));
            
            // --- NEW REALISTIC DETECTION LOGIC ---
            // 1. Check if in FOV OR in "Close-Range Awareness" (Peripheral Zone)
            const inFOV = angleDiff <= fov / 2;
            const inPeripheral = dist < Config.SENSORY.PERIPHERAL_DIST;

            if ((inFOV || inPeripheral) && world.hasLineOfSight(this.agent.pos, other.pos)) {
                // Determine Detection Rate based on Fall-offs
                let detectionRate = Config.SENSORY.DETECTION_RATE_BASE;

                // A. Distance Fall-off (Length)
                const distMult = 1.0 - (dist / range); // 1.0 at 0px, 0.0 at max range
                detectionRate *= distMult;

                // B. Angular Fall-off (Horizontal)
                // Center "Fovea" gets 100%, edges get 20%
                let angularMult = 1.0;
                if (angleDiff > Config.SENSORY.FOVEA_ANGLE) {
                    const t = (angleDiff - Config.SENSORY.FOVEA_ANGLE) / (fov/2 - Config.SENSORY.FOVEA_ANGLE);
                    angularMult = Utils.lerp(1.0, 0.2, Utils.clamp(t, 0, 1));
                }
                detectionRate *= angularMult;

                // C. Movement Multiplier (Detection is easier if target is moving)
                if (other.isMoving) {
                    // Moving targets are much easier to see in periphery
                    const moveBonus = inFOV ? 1.5 : Config.SENSORY.MOVEMENT_DETECTION_MULT;
                    detectionRate *= moveBonus;
                }

                // D. Concealment (Bushes)
                if (other.state && other.state.inBush) {
                    detectionRate *= 0.3; // Much harder to spot in a bush
                }

                // E. Stress (Tunnel Vision)
                if (this.agent.state.stress > 70 && !inFOV) {
                    detectionRate = 0; // Stress kills peripheral awareness
                }

                // Update Meter
                this.agent.memory.updateDetection(other.id, detectionRate * (dt / 1000));

                // Check if spotted
                if (this.agent.memory.isSpotted(other.id)) {
                    seen.push(other);
                }
            }
        }

        // 2. Discover Covers (Optimization: Could also be spatial, but list is small usually)
        // If covers list grows large, add them to spatial grid too.
        for (const cover of world.covers) {
            const coverPos = { x: cover.x + cover.w/2, y: cover.y + cover.h/2 };
            const dist = Utils.distance(this.agent.pos, coverPos);
            if (dist > range) continue;

            const angleTo = Utils.angle(this.agent.pos, coverPos);
            let angleDiff = angleTo - this.agent.angle;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

            if (Math.abs(angleDiff) <= fov / 2 || dist < 60) {
                if (world.hasLineOfSight(this.agent.pos, coverPos)) {
                    this.agent.memory.discoveredCovers.add(cover);
                }
            }
        }

        // 3. Update Memory
        seen.forEach(target => {
            if (target.team !== this.agent.team) {
                this.agent.memory.updateHostile(target.id, target.pos, Date.now());
                this.agent.memory.updateHeat(target.pos.x, target.pos.y, world, 3); 
                this.agent.react(world);
            }
        });

        // 4. Discover Loot
        for (const item of world.loot) {
            const dist = Utils.distance(this.agent.pos, item);
            if (dist > range) continue;

            const angleTo = Utils.angle(this.agent.pos, item);
            const inFOV = Math.abs(Utils.angleDiff(this.agent.angle, angleTo)) <= fov / 2;
            const inPeripheral = dist < 60;

            if ((inFOV || inPeripheral) && world.hasLineOfSight(this.agent.pos, item)) {
                 const mem = this.agent.memory.knownLoot;
                 const existing = mem.find(l => l.x === item.x && l.y === item.y);
                 if (!existing) {
                     mem.push({ x: item.x, y: item.y, type: item.type, timestamp: Date.now() });
                 } else {
                     existing.timestamp = Date.now();
                 }
            }
        }

        // 4b. Cleanup Ghost Loot (Visual Verification)
        const mem = this.agent.memory.knownLoot;
        for (let i = mem.length - 1; i >= 0; i--) {
            const known = mem[i];
            const dist = Utils.distance(this.agent.pos, known);
            if (dist > range) continue;

            const angleTo = Utils.angle(this.agent.pos, known);
            const inFOV = Math.abs(Utils.angleDiff(this.agent.angle, angleTo)) <= fov / 2;
            
            if (inFOV && world.hasLineOfSight(this.agent.pos, known)) {
                // We are looking right at where it should be. Is it actually there?
                const stillThere = world.loot.some(l => l.x === known.x && l.y === known.y);
                if (!stillThere) {
                    mem.splice(i, 1);
                }
            }
        }

        // 5. Mapping (Raycasting)
        // Reduced ray count for performance
        const rayCount = 12; 
        for (let i = 0; i < rayCount; i++) {
            const angle = this.agent.angle - fov/2 + (fov * i / (rayCount - 1));
            const dist = world.getRayDistance(this.agent.pos, angle, range);
            
            const steps = Math.floor(dist / Config.WORLD.GRID_SIZE);
            for (let s = 1; s <= steps; s++) { // Skip 0 (self)
                const px = this.agent.pos.x + Math.cos(angle) * s * Config.WORLD.GRID_SIZE;
                const py = this.agent.pos.y + Math.sin(angle) * s * Config.WORLD.GRID_SIZE;
                this.updateObstacleMap(px, py, world, 0);
            }
            
            if (dist < range) {
                const wx = this.agent.pos.x + Math.cos(angle) * (dist + 5);
                const wy = this.agent.pos.y + Math.sin(angle) * (dist + 5);
                this.updateObstacleMap(wx, wy, world, 1);
            }
        }

        return seen;
    }

    updateObstacleMap(x, y, world, val) {
        // Safe update
        const mem = this.agent.memory;
        const gx = Math.floor((x / world.width) * mem.gridCols);
        const gy = Math.floor((y / world.height) * mem.gridRows);
        if (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) {
            mem.obstacleMap[gy][gx] = val;
        }
    }

    processSound(soundEvent, world) {
        // 1. Calculate Distance Falloff
        const dist = Utils.distance(this.agent.pos, {x: soundEvent.x, y: soundEvent.y});
        if (dist > soundEvent.radius) return; // Too far

        let intensity = 1.0 - (dist / soundEvent.radius); // 1.0 at source, 0.0 at max range

        // 2. Occlusion Dampening (Muffling)
        // Raycast to count walls
        const wallCount = this.countWallsBetween(this.agent.pos, {x: soundEvent.x, y: soundEvent.y}, world);
        if (wallCount > 0) {
            intensity *= Math.pow(0.5, wallCount); // Halve intensity for each wall
        }

        // 3. Threshold Check
        if (intensity * 10 < Config.PHYSICS.HEARING_THRESHOLD) return; // Too faint

        let baseIntensity = 0;
        let stressImpact = 0;
        let addHeat = false;

        if (soundEvent.type === 'GUNSHOT') {
            baseIntensity = 10;
            stressImpact = 5;
            addHeat = true;
        } else if (soundEvent.type === 'RUSTLE' || soundEvent.type === 'STEP') {
            baseIntensity = soundEvent.type === 'RUSTLE' ? 5 : 3;
            stressImpact = 1; 
            addHeat = true;
        } else if (soundEvent.type === 'SHOUT') {
            baseIntensity = 8;
            stressImpact = 2;
            addHeat = true;
        } else if (soundEvent.type === 'EXPLOSION') {
            baseIntensity = 15;
            stressImpact = 10;
            addHeat = true;
        }

        // Scale by perceived intensity
        const perceivedIntensity = baseIntensity * intensity;
        const perceivedStress = stressImpact * intensity;

        // --- STARTLE EFFECT ---
        // Massive sounds nearby cause suppression/shock even without LOS
        if (perceivedIntensity > 10) {
            this.agent.suppress(Config.SENSORY.HEARING_STARTLE_SUPPRESSION * intensity, world);
        }

        // Filter out obvious allies
        let isConfirmedAlly = false;
        if (soundEvent.sourceTeam === this.agent.team) {
             const hasLOS = world.hasLineOfSight(this.agent.pos, { x: soundEvent.x, y: soundEvent.y });
             
             // If we see them or are very close/unobstructed, ignore heat
             if (hasLOS || (dist < 300 && wallCount === 0)) {
                 addHeat = false;
                 isConfirmedAlly = true;
                 // Stress still applies for loud noises near us (Startle)
                 if (perceivedStress < 2) stressImpact = 0;
             }
        }

        if (addHeat) {
            this.agent.state.modifyStress(perceivedStress * this.agent.traits.neuroticism);
            this.agent.memory.updateHeat(soundEvent.x, soundEvent.y, world, perceivedIntensity / 5);
        }

        if (!isConfirmedAlly) {
            this.agent.memory.dangerZones.push({
                x: soundEvent.x,
                y: soundEvent.y,
                intensity: perceivedIntensity,
                timestamp: Date.now()
            });
        }

        // React if significant
        if (perceivedIntensity > 3 && !isConfirmedAlly) {
            this.agent.react(world);
        }
    }

    countWallsBetween(p1, p2, world) {
        let walls = 0;
        const dist = Utils.distance(p1, p2);
        const steps = Math.ceil(dist / world.gridSize);
        const dx = (p2.x - p1.x) / steps;
        const dy = (p2.y - p1.y) / steps;

        let lastGx = -1, lastGy = -1;

        for (let i = 0; i <= steps; i++) {
            const x = p1.x + dx * i;
            const y = p1.y + dy * i;
            const gx = Math.floor(x / world.gridSize);
            const gy = Math.floor(y / world.gridSize);

            // Avoid double counting same wall cell
            if (gx === lastGx && gy === lastGy) continue;
            lastGx = gx;
            lastGy = gy;

            if (gx >= 0 && gy >= 0 && gy < world.grid.length && gx < world.grid[0].length) {
                if (world.grid[gy][gx] === 1) { // 1 = Hard Wall
                    walls++;
                }
            }
        }
        return walls;
    }
}
