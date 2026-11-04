import { Utils } from './Utils.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';

export class Sensory {
    constructor(agent) {
        this.agent = agent;
        this.assignedSector = null; // { start, end }
        this.lastScanAt = 0;
        this.lastScanResult = [];
        this.scanInterval = 200;
    }

    calculateTacticalGaze(world) {
        const sectors = 8;
        let bestScore = -Infinity;
        let bestAngle = this.agent.angle;
        
        const scanRadius = 250;
        const allySearchRadius = 150;

        const nearbyAllies = world.spatial.query(this.agent.pos.x, this.agent.pos.y, allySearchRadius)
            .filter(a => a.team === this.agent.team && a.id !== this.agent.id);

        const mem = this.agent.memory;
        const threat = this.getAverageEnemyPos(world);
        const nearbyTeammates = world.spatial.query(this.agent.pos.x, this.agent.pos.y, 400)
            .filter(a => a.team === this.agent.team && a !== this.agent && !a.state.isDead);
        
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

            if (this.assignedSector) {
                const center = (this.assignedSector.start + this.assignedSector.end) / 2;
                const diff = Math.abs(Utils.angleDiff(center, theta));
                score += (Math.PI - diff) * 20;
            }

            const lookX = this.agent.pos.x + Math.cos(theta) * scanRadius;
            const lookY = this.agent.pos.y + Math.sin(theta) * scanRadius;
            
            const gx = Math.floor((lookX / world.width) * mem.gridCols);
            const gy = Math.floor((lookY / world.height) * mem.gridRows);
            
            if (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) {
                score += mem.heatmap[gy][gx] * 10;
            }

            let isCovered = false;
            for (const ally of nearbyAllies) {
                const angleDiff = Math.abs(Utils.angleDiff(ally.angle, theta));
                if (angleDiff < (Math.PI / 6)) {
                    isCovered = true;
                    break;
                }
            }
            if (isCovered) score -= 50;

            if (world.isWallAt(this.agent.pos.x + Math.cos(theta) * 30, this.agent.pos.y + Math.sin(theta) * 30)) {
                score -= 1000;
            }

            if (threat) {
                const angleToThreat = Utils.angle(this.agent.pos, threat);
                const diff = Math.abs(Utils.angleDiff(angleToThreat, theta));
                if (diff < Math.PI / 2) {
                    score += (Math.PI / 2 - diff) * 20;
                }
            }

            if (this.agent.squad && this.agent.squad.tacticalPlan && this.agent.squad.tacticalPlan.type === 'DEFEND_PERIMETER') {
                const squadCenter = this.agent.squad.centroid;
                const angleOut = Utils.angle(squadCenter, this.agent.pos);
                const diff = Math.abs(Utils.angleDiff(angleOut, theta));
                if (diff < Math.PI / 4) {
                    score += 60;
                }
            }

            nearbyTeammates.forEach(a => {
                if (Date.now() - a.state.lastFireTime < 1000) {
                     const angleToAlly = Utils.angle(this.agent.pos, a.pos);
                     const diff = Math.abs(Utils.angleDiff(angleToAlly, theta));
                     if (diff < Math.PI / 3) score += 50;
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

    scan(world, dt = null) {
        const now = Date.now();
        if (this.lastScanAt > 0 && now - this.lastScanAt < this.scanInterval) {
            this.lastScanResult = this.lastScanResult.filter(agent => !agent.state?.isDead && world.agents.includes(agent));
            return this.lastScanResult;
        }

        const elapsed = this.lastScanAt > 0 ? now - this.lastScanAt : 16.6;
        dt = Number.isFinite(dt) ? Math.max(0, Math.min(250, dt)) : Math.max(0, Math.min(250, elapsed));
        this.lastScanAt = now;
        const seen = [];
        const fov = Config.AGENT.FOV;
        const range = Config.AGENT.VISION_RADIUS;

        const potentialTargets = world.spatial.query(this.agent.pos.x, this.agent.pos.y, range);
        
        for (const other of potentialTargets) {
            if (other === this.agent || other.isCover) continue; 
            
            const dist = Utils.distance(this.agent.pos, other.pos);
            if (dist > range) continue;

            const angleTo = Utils.angle(this.agent.pos, other.pos);
            let angleDiff = Math.abs(Utils.angleDiff(this.agent.angle, angleTo));
            
            const effectiveFOV = (this.agent.state && this.agent.state.inBush) ? fov * 0.7 : fov;
            const inFOV = angleDiff <= effectiveFOV / 2;
            const inPeripheral = dist < Config.SENSORY.PERIPHERAL_DIST;

            if ((inFOV || inPeripheral) && world.hasVisualLine(this.agent.pos, other.pos)) {
                let detectionRate = Config.SENSORY.DETECTION_RATE_BASE;

                const distMult = 1.0 - (dist / range);
                detectionRate *= distMult;

                let angularMult = 1.0;
                if (angleDiff > Config.SENSORY.FOVEA_ANGLE) {
                    const t = (angleDiff - Config.SENSORY.FOVEA_ANGLE) / (fov/2 - Config.SENSORY.FOVEA_ANGLE);
                    angularMult = Utils.lerp(1.0, 0.2, Utils.clamp(t, 0, 1));
                }
                detectionRate *= angularMult;

                if (other.isMoving) {
                    const moveBonus = inFOV ? 1.5 : Config.SENSORY.MOVEMENT_DETECTION_MULT;
                    detectionRate *= moveBonus;
                }

                if (other.state && other.state.inBush) {
                    const minVisibilityRange = 40;
                    const maxVisibilityRange = 150;
                    
                    const t = Utils.clamp((dist - minVisibilityRange) / (maxVisibilityRange - minVisibilityRange), 0, 1);
                    let bushPenalty = Utils.lerp(1.0, 0.1, t);
                    
                    if (other.isMoving) {
                        const moveMult = (other.movementMode === 'SNEAKING' || other.movementMode === 'COVERING') ? 2.5 : 5.0;
                        bushPenalty = Math.min(1.0, bushPenalty * moveMult);
                    }

                    detectionRate *= bushPenalty;
                }

                if (this.agent.state.stress > 70 && !inFOV) {
                    detectionRate = 0;
                }

                this.agent.memory.updateDetection(other.id, detectionRate * (dt / 1000));

                if (this.agent.memory.isSpotted(other.id)) {
                    seen.push(other);
                }
            }
        }

        for (const cover of world.covers) {
            const coverPos = { x: cover.x + cover.w/2, y: cover.y + cover.h/2 };
            const dist = Utils.distance(this.agent.pos, coverPos);
            if (dist > range) continue;

            const angleTo = Utils.angle(this.agent.pos, coverPos);
            let angleDiff = angleTo - this.agent.angle;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

            if (Math.abs(angleDiff) <= fov / 2 || dist < 60) {
                if (world.hasVisualLine(this.agent.pos, coverPos)) {
                    this.agent.memory.discoveredCovers.add(cover);
                }
            }
        }

        seen.forEach(target => {
            if (target.team !== this.agent.team) {
                this.agent.memory.updateHostile(target.id, target.pos, now);
                this.agent.memory.updateHeat(target.pos.x, target.pos.y, world, 3, false); 
                this.agent.react(world);
            } else {
                this.agent.memory.updateControl(target.pos.x, target.pos.y, world, 10);

                const allyAction = target.currentAction ? target.currentAction.type : 'IDLE';
                const distToAlly = Utils.distance(this.agent.pos, target.pos);

                if (allyAction === 'ATTACK' || allyAction === 'SUPPRESS') {
                    const range = target.state.inventory.weapon.range || 600;
                    const rayEnd = {
                        x: target.pos.x + Math.cos(target.angle) * range,
                        y: target.pos.y + Math.sin(target.angle) * range
                    };
                    
                    const intensity = allyAction === 'ATTACK' ? 2.0 : 0.5;
                    this.agent.memory.updateHeat(rayEnd.x, rayEnd.y, world, intensity); 
                    
                    const midX = target.pos.x + Math.cos(target.angle) * (range/2);
                    const midY = target.pos.y + Math.sin(target.angle) * (range/2);
                    this.agent.memory.updateHeat(midX, midY, world, intensity);

                } else if (target.brain && target.brain.currentThought === 'SURVIVAL') {

                    const dangerDir = target.angle + Math.PI;
                    const dangerX = target.pos.x + Math.cos(dangerDir) * 300;
                    const dangerY = target.pos.y + Math.sin(dangerDir) * 300;
                    
                    this.agent.memory.updateHeat(dangerX, dangerY, world, 1.0);
                }
            }
        });

        for (const item of world.loot) {
            const dist = Utils.distance(this.agent.pos, item);
            if (dist > range) continue;

            const angleTo = Utils.angle(this.agent.pos, item);
            const inFOV = Math.abs(Utils.angleDiff(this.agent.angle, angleTo)) <= fov / 2;
            const inPeripheral = dist < 60;

            if ((inFOV || inPeripheral) && world.hasVisualLine(this.agent.pos, item)) {
                 const mem = this.agent.memory.knownLoot;
                 const existing = mem.find(l => l.x === item.x && l.y === item.y);
                 if (!existing) {
                     mem.push({ x: item.x, y: item.y, type: item.type, timestamp: Date.now() });
                 } else {
                     existing.timestamp = Date.now();
                 }
            }
        }

        const mem = this.agent.memory.knownLoot;
        for (let i = mem.length - 1; i >= 0; i--) {
            const known = mem[i];
            const dist = Utils.distance(this.agent.pos, known);
            if (dist > range) continue;

            const angleTo = Utils.angle(this.agent.pos, known);
            const inFOV = Math.abs(Utils.angleDiff(this.agent.angle, angleTo)) <= fov / 2;
            
            if (inFOV && world.hasVisualLine(this.agent.pos, known)) {
                const stillThere = world.loot.some(l => l.x === known.x && l.y === known.y);
                if (!stillThere) {
                    mem.splice(i, 1);
                }
            }
        }

        const ghosts = this.agent.memory.knownHostiles.filter(h => h.isGhost);
        for (const ghost of ghosts) {
            const dist = Utils.distance(this.agent.pos, ghost.lastKnownPosition);
            if (dist > range) continue;

            const angleTo = Utils.angle(this.agent.pos, ghost.lastKnownPosition);
            const inFOV = Math.abs(Utils.angleDiff(this.agent.angle, angleTo)) <= fov / 2;

            if (inFOV && world.hasVisualLine(this.agent.pos, ghost.lastKnownPosition)) {
                 const liveRef = this.agent.memory.knownHostiles.find(h => h.id === ghost.id);
                 if (liveRef && !liveRef.isGhost) continue;

                 this.agent.memory.verifyClear(ghost.lastKnownPosition, 50);
            }
        }

        const rayCount = 12; 
        for (let i = 0; i < rayCount; i++) {
            const angle = this.agent.angle - fov/2 + (fov * i / (rayCount - 1));
            const dist = world.getRayDistance(this.agent.pos, angle, range);
            
            const steps = Math.floor(dist / Config.WORLD.GRID_SIZE);
            for (let s = 1; s <= steps; s++) {
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

        const memObj = this.agent.memory;
        const cellRes = Config.WORLD.INTEL_GRID_SIZE;

        const allyCells = new Set();
        seen.forEach(s => {
            if (s.team === this.agent.team && s.pos) {
                const gx = Math.floor(s.pos.x / cellRes);
                const gy = Math.floor(s.pos.y / cellRes);
                allyCells.add(`${gx},${gy}`);
            }
        });
        
        const minGx = Math.max(0, Math.floor((this.agent.pos.x - range) / cellRes));
        const maxGx = Math.min(memObj.gridCols - 1, Math.floor((this.agent.pos.x + range) / cellRes));
        const minGy = Math.max(0, Math.floor((this.agent.pos.y - range) / cellRes));
        const maxGy = Math.min(memObj.gridRows - 1, Math.floor((this.agent.pos.y + range) / cellRes));

        for (let gy = minGy; gy <= maxGy; gy++) {
            for (let gx = minGx; gx <= maxGx; gx++) {
                const cx = (gx + 0.5) * cellRes;
                const cy = (gy + 0.5) * cellRes;
                const cellPos = { x: cx, y: cy };

                const d = Utils.distance(this.agent.pos, cellPos);
                if (d > range) continue;

                const angleTo = Utils.angle(this.agent.pos, cellPos);
                const aDiff = Math.abs(Utils.angleDiff(this.agent.angle, angleTo));

                if (aDiff <= fov / 2) {
                    if (world.hasVisualLine(this.agent.pos, cellPos, range)) {
                        memObj.markObserved(gx, gy);

                        const t = aDiff / (fov / 2);
                        const multiplier = Utils.lerp(15.0, 2.0, t);
                        
                        if (memObj.heatmap[gy][gx] > 0) {
                            memObj.decayHeatAt(gx, gy, multiplier, 100); 
                        }
                        
                        const isOccupiedByAlly = allyCells.has(`${gx},${gy}`);
                        if (!isOccupiedByAlly && memObj.controlMap[gy][gx] > 0) {
                            memObj.decayControlAt(gx, gy, multiplier, 100);
                        }
                    }
                }
            }
        }

        this.lastScanResult = seen;
        return this.lastScanResult;
    }

    updateObstacleMap(x, y, world, val) {
        const mem = this.agent.memory;
        const gx = Math.floor((x / world.width) * mem.gridCols);
        const gy = Math.floor((y / world.height) * mem.gridRows);
        if (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) {
            mem.obstacleMap[gy][gx] = val;
        }
    }

    processSound(soundEvent, world) {
        const now = Date.now();
        const dist = Utils.distance(this.agent.pos, {x: soundEvent.x, y: soundEvent.y});
        if (dist > soundEvent.radius) return;

        let intensity = 1.0 - (dist / soundEvent.radius);

        const wallCount = this.countWallsBetween(this.agent.pos, {x: soundEvent.x, y: soundEvent.y}, world);
        if (wallCount > 0) {
            intensity *= Math.pow(0.5, wallCount);
        }

        if (intensity * 10 < Config.PHYSICS.HEARING_THRESHOLD) return;

        let baseIntensity = 0;
        let stressImpact = 0;
        let addHeat = false;
        let isConfirmedAlly = false;
        const isFriendlySource = soundEvent.sourceTeam === this.agent.team;

        if (soundEvent.type === 'GUNSHOT') {
            baseIntensity = 25;
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
            this.agent.memory.updateHazard(soundEvent.x, soundEvent.y, world, 10);
        }

        const perceivedIntensity = baseIntensity * intensity;
        const perceivedStress = stressImpact * intensity;

        if (soundEvent.type === 'RUSTLE' || soundEvent.type === 'STEP') {
            if (!isFriendlySource && perceivedIntensity > 4) {
                 this.agent.memory.updateHostile(soundEvent.sourceId, {x: soundEvent.x, y: soundEvent.y}, now, 0.5);
            }
        }

        if (perceivedIntensity > 10) {
            this.agent.suppress(Config.SENSORY.HEARING_STARTLE_SUPPRESSION * intensity, world);
        }

        // Team metadata is authoritative even when the source is distant or occluded.
        // Friendly reports can contain enemy coordinates, but the friendly's own
        // position must never contaminate hostile heat or area-fire evidence.
        if (isFriendlySource) {
            addHeat = false;
            isConfirmedAlly = true;

            if (soundEvent.distressType) {
                this.agent.memory.updateDistressSignal(
                    soundEvent.sourceId,
                    soundEvent.distressType,
                    {x: soundEvent.x, y: soundEvent.y},
                    now
                );

                if (soundEvent.distressType === 'MAN_DOWN') {
                    this.agent.state.modifyStress(Config.AGENT.STRESS_SPIKE_ALLY_DEATH);
                    this.agent.react(world, true);
                }
            }
        }

        if (isConfirmedAlly && soundEvent.type === 'SHOUT' && soundEvent.targetPos) {
            this.agent.memory.updateHeat(
                soundEvent.targetPos.x,
                soundEvent.targetPos.y,
                world,
                perceivedIntensity / 2
            );
            this.agent.memory.recordDangerZone({
                x: soundEvent.targetPos.x,
                y: soundEvent.targetPos.y,
                intensity: perceivedIntensity,
                confidence: 0.7,
                timestamp: now,
                type: 'CALLOUT',
                sourceId: soundEvent.sourceId,
                reportedByTeam: soundEvent.sourceTeam
            });
        } else if (addHeat) {
            this.agent.state.modifyStress(perceivedStress * this.agent.traits.neuroticism);

            this.agent.memory.updateHeat(soundEvent.x, soundEvent.y, world, perceivedIntensity / 3);
        } else if (isConfirmedAlly && soundEvent.type === 'GUNSHOT') {
            if (this.agent.brain.currentThought === 'IDLE' || this.agent.brain.currentThought === 'SOCIAL') {
                this.agent.brain.currentFocus = 'COMBAT';
                this.agent.brain.currentThought = 'COMBAT';
                const angleToSound = Utils.angle(this.agent.pos, {x: soundEvent.x, y: soundEvent.y});
                this.agent.targetAngle = angleToSound;
                this.agent.addBark("CONTACT!");
            }
        }

        if (!isConfirmedAlly) {
            this.agent.memory.recordDangerZone({
                x: soundEvent.x,
                y: soundEvent.y,
                intensity: perceivedIntensity,
                timestamp: now,
                type: soundEvent.type,
                sourceId: soundEvent.sourceId,
                sourceTeam: soundEvent.sourceTeam
            });
        }

        if (perceivedIntensity > 3 && !isConfirmedAlly) {
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

            if (gx === lastGx && gy === lastGy) continue;
            lastGx = gx;
            lastGy = gy;

            if (gx >= 0 && gy >= 0 && gy < world.grid.length && gx < world.grid[0].length) {
                const cell = world.grid[gy][gx];
                const isWall = cell === 1 || cell === 3 || cell === 4;
                if (isWall && !wasInWall) {
                    walls++;
                    wasInWall = true;
                } else if (!isWall && wasInWall) {
                    wasInWall = false;
                }
            }
        }
        return walls;
    }
}
