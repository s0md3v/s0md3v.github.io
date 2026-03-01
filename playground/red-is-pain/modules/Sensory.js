import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class Sensory {
    constructor(agent) {
        this.agent = agent;
        this.assignedSector = null; // { start, end }
    }

    calculateTacticalGaze(world) {
        const sectors = 8;
        let bestScore = -Infinity;
        let bestAngle = this.agent.angle;
        
        const scanRadius = 250;
        const allySearchRadius = 150;

        // Find nearby allies to avoid looking at same spot
        const nearbyAllies = world.spatial.query(this.agent.pos.x, this.agent.pos.y, allySearchRadius)
            .filter(a => a.team === this.agent.team && a.id !== this.agent.id);

        const mem = this.agent.memory;
        
        // --- SQUAD SECTOR ASSIGNMENT ---
        if (this.agent.squad && !this.assignedSector) {
             const squad = this.agent.squad;
             const memberIdx = squad.members.findIndex(m => m.id === this.agent.id);
             if (memberIdx !== -1) {
                  const slice = (Math.PI * 2) / Math.max(1, squad.members.length);
                  const start = memberIdx * slice;
                  this.assignedSector = { start, end: start + slice };
             }
        }

        for (let i = 0; i < sectors; i++) {
            const theta = (i / sectors) * Math.PI * 2;
            let score = 0;

            // Sector of Fire (Real-world squad tactics)
            if (this.assignedSector) {
                const center = (this.assignedSector.start + this.assignedSector.end) / 2;
                const diff = Math.abs(Utils.angleDiff(center, theta));
                // Bonus for looking in the assigned sector
                score += (Math.PI - diff) * 20;
            }

            // 1. Heatmap (Threat)
            const lookX = this.agent.pos.x + Math.cos(theta) * scanRadius;
            const lookY = this.agent.pos.y + Math.sin(theta) * scanRadius;
            
            // Sample heat along the ray
            const gx = Math.floor((lookX / world.width) * mem.gridCols);
            const gy = Math.floor((lookY / world.height) * mem.gridRows);
            
            if (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) {
                score += mem.heatmap[gy][gx] * 10;
            }

            // 2. Synergy: Check if allies are already covering this angle
            let isCovered = false;
            for (const ally of nearbyAllies) {
                const angleDiff = Math.abs(Utils.angleDiff(ally.angle, theta));
                if (angleDiff < (Math.PI / 6)) { // ~30 degrees overlap
                    isCovered = true;
                    break;
                }
            }
            if (isCovered) score -= 50; // Heavy penalty for redundant coverage

            // 3. Wall/Obstruction Check
            // Don't stare at walls 2 feet away
            if (world.isWallAt(this.agent.pos.x + Math.cos(theta) * 30, this.agent.pos.y + Math.sin(theta) * 30)) {
                score -= 1000;
            }

            // 4. Bias: Look towards enemy center if known
            const threat = this.getAverageEnemyPos(world);
            if (threat) {
                const angleToThreat = Utils.angle(this.agent.pos, threat);
                const diff = Math.abs(Utils.angleDiff(angleToThreat, theta));
                if (diff < Math.PI / 2) {
                    score += (Math.PI / 2 - diff) * 20;
                }
            }

            // 5. Squad Plan Bias
            if (this.agent.squad && this.agent.squad.tacticalPlan && this.agent.squad.tacticalPlan.type === 'DEFEND_PERIMETER') {
                const squadCenter = this.agent.squad.centroid;
                const angleOut = Utils.angle(squadCenter, this.agent.pos); // Vector from center to me -> outward
                const diff = Math.abs(Utils.angleDiff(angleOut, theta));
                if (diff < Math.PI / 4) {
                    score += 60; // Stronger bias
                }
            }

            // 6. Combat Support Bias (NEW)
            // If a teammate is shooting nearby, bias gaze towards their target or them
            const nearbyTeammates = world.spatial.query(this.agent.pos.x, this.agent.pos.y, 400);
            nearbyTeammates.forEach(a => {
                if (a.team === this.agent.team && a !== this.agent && !a.state.isDead) {
                    if (Date.now() - a.state.lastFireTime < 1000) {
                         const angleToAlly = Utils.angle(this.agent.pos, a.pos);
                         const diff = Math.abs(Utils.angleDiff(angleToAlly, theta));
                         if (diff < Math.PI / 3) score += 50; // Look towards the action
                    }
                }
            });

            if (score > bestScore) {
                bestScore = score;
                bestAngle = theta;
            }
        }
        
        return bestAngle;
    }

    getAverageEnemyPos(world) {
        const enemies = this.scan(world).filter(a => a.team !== this.agent.team);
        if (enemies.length === 0) return null;
        let x = 0, y = 0;
        enemies.forEach(e => {
            x += e.pos.x;
            y += e.pos.y;
        });
        return { x: x/enemies.length, y: y/enemies.length };
    }

    scan(world, dt = 16.6) {
        const seen = [];
        const fov = Config.AGENT.FOV;
        const range = Config.AGENT.VISION_RADIUS;

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
            
            // BUSH VISION: If inside a bush, FOV is 30% smaller due to foliage interference
            const effectiveFOV = (this.agent.state && this.agent.state.inBush) ? fov * 0.7 : fov;
            const inFOV = angleDiff <= effectiveFOV / 2;
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
                    // AMBUSH LOGIC:
                    // 1. Base Stealth is high (harder to spot in a bush)
                    // 2. Visibility increases if you are close (distance-based transparency)
                    // 3. Visibility increases significantly if you are moving (rustling)
                    
                    const minVisibilityRange = 40; // You are always seen if someone is this close (px)
                    const maxVisibilityRange = 150; // Beyond this, you are nearly invisible if still
                    
                    const t = Utils.clamp((dist - minVisibilityRange) / (maxVisibilityRange - minVisibilityRange), 0, 1);
                    let bushPenalty = Utils.lerp(1.0, 0.1, t); // 1.0 (fully visible) at 40px, 0.1 (stealthy) at 150px
                    
                    if (other.isMoving) {
                        // Rustling the leaves makes you much easier to spot
                        const moveMult = (other.movementMode === 'SNEAKING' || other.movementMode === 'COVERING') ? 2.5 : 5.0;
                        bushPenalty = Math.min(1.0, bushPenalty * moveMult);
                    }

                    detectionRate *= bushPenalty;
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
                this.agent.memory.updateHeat(target.pos.x, target.pos.y, world, 3, false); 
                this.agent.react(world);
            } else {
                // Update friendly control map
                // Maximum certainty for teammates we can see clearly
                this.agent.memory.updateControl(target.pos.x, target.pos.y, world, 10);

                // VISUAL INFERENCE (The "Cue")
                // Observing teammate behavior to guess enemy locations
                const allyAction = target.currentAction ? target.currentAction.type : 'IDLE';
                const distToAlly = Utils.distance(this.agent.pos, target.pos);

                if (allyAction === 'SHOOT' || allyAction === 'AIM') {
                    // "Look Where I Shoot"
                    // If ally is shooting, there is likely an enemy in that direction.
                    // Project a ray from ally and add heat.
                    const range = target.state.inventory.weapon.maxRange || 600;
                    const rayEnd = {
                        x: target.pos.x + Math.cos(target.angle) * range,
                        y: target.pos.y + Math.sin(target.angle) * range
                    };
                    
                    // Add a "Cone" of suspicion along their line of fire
                    // We step along the ray and add heat (simulating suppression awareness)
                    const intensity = allyAction === 'SHOOT' ? 2.0 : 0.5; // Shooting is much stronger signal
                    this.agent.memory.updateHeat(rayEnd.x, rayEnd.y, world, intensity); 
                    
                    // Also check a point midway
                    const midX = target.pos.x + Math.cos(target.angle) * (range/2);
                    const midY = target.pos.y + Math.sin(target.angle) * (range/2);
                    this.agent.memory.updateHeat(midX, midY, world, intensity);

                } else if (target.brain && target.brain.currentThought === 'SURVIVAL') {

                    // "Run From Danger"
                    // If ally is fleeing, the danger is BEHIND them.
                    const dangerDir = target.angle + Math.PI; // Behind
                    const dangerX = target.pos.x + Math.cos(dangerDir) * 300;
                    const dangerY = target.pos.y + Math.sin(dangerDir) * 300;
                    
                    this.agent.memory.updateHeat(dangerX, dangerY, world, 1.0);
                }
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

        // 4c. Cleanup Ghost Hostiles (Visual Verification)
        // If we look at a place where we thought an enemy was, and see nothing, clear it.
        const ghosts = this.agent.memory.knownHostiles.filter(h => h.isGhost);
        for (const ghost of ghosts) {
            const dist = Utils.distance(this.agent.pos, ghost.lastKnownPosition);
            if (dist > range) continue;

            const angleTo = Utils.angle(this.agent.pos, ghost.lastKnownPosition);
            const inFOV = Math.abs(Utils.angleDiff(this.agent.angle, angleTo)) <= fov / 2;

            if (inFOV && world.hasLineOfSight(this.agent.pos, ghost.lastKnownPosition)) {
                 // Check if there is ANY enemy near that spot that we successfully spotted
                 // If we spotted someone there, `isGhost` would be false (updated in step 3).
                 // Since `ghost` object is a snapshot, we check the live memory.
                 const liveRef = this.agent.memory.knownHostiles.find(h => h.id === ghost.id);
                 if (liveRef && !liveRef.isGhost) continue; // We just re-spotted them, don't clear

                 // We look there, and we don't see them. CLEAR.
                 this.agent.memory.verifyClear(ghost.lastKnownPosition, 50);
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

        // 5. Visual Heatmap Decay & Vision Locking
        const memObj = this.agent.memory;
        const cellRes = Config.WORLD.INTEL_GRID_SIZE;

        // TRACK VISIBLE ALLIES: We shouldn't clear 'control heat' if the ally is still standing there!
        const allyCells = new Set();
        seen.forEach(s => {
            if (s.team === this.agent.team && s.pos) {
                const gx = Math.floor(s.pos.x / cellRes);
                const gy = Math.floor(s.pos.y / cellRes);
                allyCells.add(`${gx},${gy}`);
            }
        });
        
        // OPTIMIZATION: Only iterate cells within the agent's vision range
        const minGx = Math.max(0, Math.floor((this.agent.pos.x - range) / cellRes));
        const maxGx = Math.min(memObj.gridCols - 1, Math.floor((this.agent.pos.x + range) / cellRes));
        const minGy = Math.max(0, Math.floor((this.agent.pos.y - range) / cellRes));
        const maxGy = Math.min(memObj.gridRows - 1, Math.floor((this.agent.pos.y + range) / cellRes));

        for (let gy = minGy; gy <= maxGy; gy++) {
            for (let gx = minGx; gx <= maxGx; gx++) {
                // Center of the cell in world coordinates
                const cx = (gx + 0.5) * cellRes;
                const cy = (gy + 0.5) * cellRes;
                const cellPos = { x: cx, y: cy };

                const d = Utils.distance(this.agent.pos, cellPos);
                if (d > range) continue;

                const angleTo = Utils.angle(this.agent.pos, cellPos);
                const aDiff = Math.abs(Utils.angleDiff(this.agent.angle, angleTo));

                if (aDiff <= fov / 2) {
                    if (world.hasLineOfSight(this.agent.pos, cellPos, range, true)) {
                        // VISION LOCK: Mark this cell as currently being verified
                        memObj.markObserved(gx, gy);

                        // INTELLIGENT DECAY: If there was heat/control here, clear it
                        const t = aDiff / (fov / 2);
                        const multiplier = Utils.lerp(15.0, 2.0, t);
                        
                        if (memObj.heatmap[gy][gx] > 0) {
                            memObj.decayHeatAt(gx, gy, multiplier, 100); 
                        }
                        
                        // Only clear friendly control if NO ALLY is currently visible in this cell
                        const isOccupiedByAlly = allyCells.has(`${gx},${gy}`);
                        if (!isOccupiedByAlly && memObj.controlMap[gy][gx] > 0) {
                            memObj.decayControlAt(gx, gy, multiplier, 100);
                        }
                    }
                }
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
        let isConfirmedAlly = false;

        if (soundEvent.type === 'GUNSHOT') {
            baseIntensity = 25; // Increased to ensure long-range reactions (was 10)
            stressImpact = 5;
            addHeat = true;
        } else if (soundEvent.type === 'RUSTLE' || soundEvent.type === 'STEP') {
            baseIntensity = soundEvent.type === 'RUSTLE' ? 5 : 3;
            stressImpact = 1; 
            addHeat = true;
        } else if (soundEvent.type === 'SHOUT' || soundEvent.type === 'MEDIC_CALL') {
            baseIntensity = 8;
            stressImpact = 2;
            addHeat = true;
        } else if (soundEvent.type === 'EXPLOSION') {
            baseIntensity = 15;
            stressImpact = 10;
            // Explosions are hazards, not necessarily enemy positions
            this.agent.memory.updateHazard(soundEvent.x, soundEvent.y, world, 10);
        }

        // Scale by perceived intensity
        const perceivedIntensity = baseIntensity * intensity;
        const perceivedStress = stressImpact * intensity;

        // --- AUDITORY SIGHTING (Footsteps) ---
        if (soundEvent.type === 'RUSTLE' || soundEvent.type === 'STEP') {
            // If we hear a footstep from a non-ally, create a Ghost contact in memory
            if (!isConfirmedAlly && perceivedIntensity > 4) {
                 this.agent.memory.updateHostile(soundEvent.sourceId, {x: soundEvent.x, y: soundEvent.y}, Date.now(), 0.5); // 0.5 confidence
            }
        }

        // --- STARTLE EFFECT ---
        // Massive sounds nearby cause suppression/shock even without LOS
        if (perceivedIntensity > 10) {
            this.agent.suppress(Config.SENSORY.HEARING_STARTLE_SUPPRESSION * intensity, world);
        }

        // Filter out obvious allies
        if (soundEvent.sourceTeam === this.agent.team) {
             const hasLOS = world.hasLineOfSight(this.agent.pos, { x: soundEvent.x, y: soundEvent.y });
             
             // If we see them or are very close/unobstructed, ignore heat
             if (hasLOS || (dist < 300 && wallCount === 0)) {
                 addHeat = false;
                 isConfirmedAlly = true;
                 
                 // RECORD DISTRESS SIGNAL
                 if (soundEvent.distressType) {
                    this.agent.memory.updateDistressSignal(soundEvent.sourceId, soundEvent.distressType, {x: soundEvent.x, y: soundEvent.y}, Date.now());
                    
                    if (soundEvent.distressType === 'MAN_DOWN') {
                        this.agent.state.modifyStress(Config.AGENT.STRESS_SPIKE_ALLY_DEATH);
                        this.agent.react(world, true);
                    }
                 }

                 // Stress still applies for loud noises near us (Startle)
                 if (perceivedStress < 2) stressImpact = 0;
             }
        }

        if (addHeat) {
            this.agent.state.modifyStress(perceivedStress * this.agent.traits.neuroticism);

            // AUDITORY INFERENCE (The "Callout")
            // If this is a friendly SHOUT with a target position, use that pos.
            // Otherwise use sound source.
            if (soundEvent.type === 'SHOUT' && soundEvent.targetPos && isConfirmedAlly) {
                 // "Enemy over there!"
                 this.agent.memory.updateHeat(soundEvent.targetPos.x, soundEvent.targetPos.y, world, perceivedIntensity / 2);
            } else {
                 // Increased from perceivedIntensity / 5 to / 3 for more responsive hearing-based heat
                 this.agent.memory.updateHeat(soundEvent.x, soundEvent.y, world, perceivedIntensity / 3);
            }
        } else if (isConfirmedAlly && soundEvent.type === 'GUNSHOT') {
            // FRIENDLY FIRE CUE
            // We hear a friend shooting but don't see them or the target.
            // We don't know WHERE the enemy is (no heat added), but we know we are in a fight.
            if (this.agent.brain.currentThought === 'IDLE' || this.agent.brain.currentThought === 'SOCIAL') {
                // Immediate combat pivot
                this.agent.brain.currentFocus = 'COMBAT';
                this.agent.brain.currentThought = 'COMBAT';
                // Look towards the sound
                const angleToSound = Utils.angle(this.agent.pos, {x: soundEvent.x, y: soundEvent.y});
                this.agent.targetAngle = angleToSound;
                this.agent.addBark("CONTACT!");
            }
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
            // Force immediate reaction on gunshots to ensure agents pivot quickly
            this.agent.react(world, soundEvent.type === 'GUNSHOT');
        }    }

    countWallsBetween(p1, p2, world) {
        let walls = 0;
        const dist = Utils.distance(p1, p2);
        const steps = Math.ceil(dist / world.gridSize);
        const dx = (p2.x - p1.x) / steps;
        const dy = (p2.y - p1.y) / steps;

        let lastGx = -1, lastGy = -1;
        let wasInWall = false;

        for (let i = 0; i <= steps; i++) {
            const x = p1.x + dx * i;
            const y = p1.y + dy * i;
            const gx = Math.floor(x / world.gridSize);
            const gy = Math.floor(y / world.gridSize);

            // Avoid double checking same grid cell
            if (gx === lastGx && gy === lastGy) continue;
            lastGx = gx;
            lastGy = gy;

            if (gx >= 0 && gy >= 0 && gy < world.grid.length && gx < world.grid[0].length) {
                const isWall = world.grid[gy][gx] === 1; // 1 = Hard Wall
                if (isWall && !wasInWall) {
                    walls++; // Just entered a wall
                    wasInWall = true;
                } else if (!isWall && wasInWall) {
                    wasInWall = false; // Exited the wall
                }
            }
        }
        return walls;
    }
}
