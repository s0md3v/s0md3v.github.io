import { Utils } from './Utils.js';
import { Config } from './Config.js';

export class CombatEvaluator {
    constructor(decisionModule) {
        this.decision = decisionModule;
        this.agent = decisionModule.agent;
    }

    scoreCombat(world) {
        const enemy = this.decision.getThreatSource(world, true);
        if (!enemy) return { score: 0 };
        
        const enemyPos = enemy.lastKnownPosition || enemy.pos; 
        const dist = Utils.distance(this.agent.pos, enemyPos);
        
        // TACTICAL COORDINATION (Bounding Overwatch)
        const inChaos = world.commandChaos && world.commandChaos[this.agent.team] > 0;
        const suppressors = this.decision.getSquadActionCount(world, 'SUPPRESS');
        const attackers = this.decision.getSquadActionCount(world, 'ATTACK');
        const totalActive = suppressors + attackers;
        
        // Check if ANYONE in the squad is currently advancing
        const anyoneAdvancing = !inChaos && world.agents.some(a => 
            a.team === this.agent.team && 
            a !== this.agent && 
            (Date.now() - (a.lastAdvanceTime || 0) < 1000)
        );

        let moveTarget = null;
        let shouldAdvance = false;
        
        // WEAPON-BASED MOVEMENT BIAS
        // If my weapon is short-range (Shotgun/SMG), I WANT to advance.
        // If my optimal Range < current distance, I want to advance.
        const weapon = this.agent.state.inventory.weapon;
        const optimalDist = weapon.optimalRange || 200;
        
        // If we are way outside effective range, advance
        if (dist > optimalDist * 1.5) shouldAdvance = true;
        
        // Role/Trait Modifiers
        if (weapon.handling > 0.8 || weapon.optimalRange < 150) shouldAdvance = true; // Still keep role bias as "Training"
        
        // If suppression is active and I have a long-range weapon, I should hold
        const isLongRange = optimalDist > 250;
        if (!inChaos && suppressors >= 1 && totalActive >= 2 && !isLongRange) shouldAdvance = true; 
        
        // Boldness (Openness/Extraversion)
        if (!inChaos && this.agent.traits.openness > 0.7 && suppressors >= 1) shouldAdvance = true;

        // If I am a Gunner (High Capacity/Long Range) and someone is advancing, I MUST suppress
        // Replaced explicit Role check with Weapon Attribute check
        const isSuppressionWeapon = weapon.capacity > 60; // LMGs have big mags
        if (isSuppressionWeapon && anyoneAdvancing) {
             shouldAdvance = false; 
        }

        // SQUAD PLAN OVERRIDE
        let flankSide = null;
        if (this.agent.squad && this.agent.squad.tacticalPlan) {
            const plan = this.agent.squad.tacticalPlan;
            const isBounder = this.agent.squad.activeBounderId === this.agent.id;
            const inCombatMode = this.agent.squad.status === 'ATTACK' || this.agent.squad.status === 'ENGAGE';

            // If we are in a coordinated squad, we only advance if it is our turn (Bounding Overwatch)
            if (inCombatMode && !isBounder && totalActive >= 2 && !inChaos) {
                shouldAdvance = false; // Stay back and suppress
            } else if (inCombatMode && isBounder) {
                shouldAdvance = true; // My turn to push!
            }

            if (plan.type === 'FLANK_LEFT') {
                flankSide = 'LEFT';
            } else if (plan.type === 'FLANK_RIGHT') {
                flankSide = 'RIGHT';
            }
        }

        if (shouldAdvance) {
            // 1. Determine Intent (Flank or safe cover)
            let intendedTarget = this.decision.findFlankSpot(world, enemyPos, flankSide);
            
            if (!intendedTarget) {
                 // Fallback: No flank spot, find cover (Increased radius)
                 intendedTarget = this.decision.findNearestCover(world, 500);
            }

            if (intendedTarget) {
                // 2. Check Arrival
                if (Utils.distance(this.agent.pos, intendedTarget) < 50) {
                    shouldAdvance = false;
                } else if (!inChaos) {
                    this.agent.lastAdvanceTime = Date.now();
                }
                moveTarget = intendedTarget;
            } else {
                moveTarget = enemyPos;
            }
        } else {
            // Defensive/Holding: Find nearest cover relative to enemy last known position
            
            // Check if we are ALREADY in good cover
            const currentCover = this.decision.findNearestCover(world, 60); // Check immediate vicinity
            let holdingGround = false;
            
            if (currentCover && Utils.distance(this.agent.pos, currentCover) < 40) {
                 // We are in cover. Is it still valid? (Directional check could go here)
                 holdingGround = true;
            }

            if (!holdingGround) {
                // If we lost LOS and are healthy/aggressive, try to peek/pursue first before engaging "Generic Cover Search"
                // This prevents "Peek-shoot-hide" loops when we should be finishing the fight
                const isAggressive = this.agent.state.stress < 50 && this.agent.state.hp > this.agent.state.maxHp * 0.5;
                const hasLOS = world.hasLineOfSight(this.agent.pos, enemyPos);

                if (!hasLOS && isAggressive) {
                     const peek = this.decision.tacticalEval.findPeekSpot(world, enemyPos);
                     if (peek) moveTarget = peek;
                     else moveTarget = enemyPos; // Push to last known
                } else {
                    const tacticalCover = this.decision.findNearestCover(world, 500);
                    if (tacticalCover) {
                        moveTarget = tacticalCover;
                    } else {
                        // No cover? Move to enemy
                        moveTarget = enemyPos;
                    }
                }
            } else {
                // We are holding ground. Dont move unless flushed or flanking.
                
                // Exception: If we can't see the enemy from this cover, we MUST move
                const hasLOS = world.hasLineOfSight(this.agent.pos, enemyPos);
                if (!hasLOS && this.agent.state.stress < 80) {
                     const peek = this.decision.tacticalEval.findPeekSpot(world, enemyPos);
                     if (peek) moveTarget = peek;
                } else {
                    moveTarget = null;
                }
            }
        }
        
        if (moveTarget && this.agent.memory.isUnreachable(moveTarget)) {
            moveTarget = null; // Cancel move if unreachable
        }

        if (weapon.range > 500 && dist < 350) {
            moveTarget = this.decision.findNearestCover(world, 400); 
        }

        if (enemy.id !== undefined) {
             let score = 2.0;
             const movementMode = shouldAdvance ? 'BOUNDING' : 'TACTICAL';

             // HIT CHANCE CALCULATION
             const weapon = this.agent.state.inventory.weapon;
             const optimal = weapon.optimalRange || 200;
             const falloff = 0.0006 * (2.0 - (weapon.handling || 1.0));
             let spread = weapon.spread || 0.05;
             if (dist > optimal) spread += (dist - optimal) * falloff;
             
             // Approximate arc size at target distance
             const arcWidth = dist * spread; 
             const targetSize = 16; // 2x radius (was 20, but agents are 6r=12d. Let's use 16 for slightly generous hit-checking)
             const hitChance = Math.min(1.0, targetSize / Math.max(1, arcWidth));
             
             // DECISION LOGIC: SHOULD I FIRE?
             const isReckless = this.agent.state.stress > 60 || this.agent.traits.extraversion > 0.7 || this.agent.role === 'GUNNER';
             const isCautious = this.agent.traits.conscientiousness > 0.6 && this.agent.state.stress < 40;

             // PEEK LOGIC: If I can't see the enemy, find a peek spot
             const hasLOS = world.hasLineOfSight(this.agent.pos, enemyPos);
             
             // HYSTERESIS START: Reuse existing moveTarget to prevent jitter
             let keptOldTarget = false;
             if (this.agent.currentAction && 
                 this.agent.currentAction.type === 'ATTACK' && 
                 this.agent.currentAction.targetId === enemy.id &&
                 this.agent.currentAction.moveTarget) {
                 
                 const oldTarget = this.agent.currentAction.moveTarget;
                 const distToOld = Utils.distance(this.agent.pos, oldTarget);
                 
                 // Keep it if valid and we aren't there yet
                 if (distToOld > 10 && distToOld < 600) { // Sanity check distance
                      moveTarget = oldTarget;
                      keptOldTarget = true;
                      score += 0.5; // Consistency bonus
                 }
             }
             // HYSTERESIS END

             if (!keptOldTarget && !hasLOS && !shouldAdvance && !moveTarget) {
                 const peekSpot = this.decision.tacticalEval.findPeekSpot(world, enemyPos);
                 if (peekSpot) {
                     moveTarget = peekSpot;
                     score += 0.5; // Bonus for finding a good firing position
                 }
             }

             if (hitChance < 0.15 && !isReckless) {
                 if (isCautious) {
                     // Too hard to hit, don't waste ammo. Reposition instead.
                     score = 0.5; 
                 } else {
                     score *= 0.8;
                 }
             } else if (hitChance > 0.6) {
                     score += 1.0; // Confident shot
             }

             return { type: 'ATTACK', targetId: enemy.id, moveTarget: moveTarget, score: score, movementMode: movementMode };
        } else {
            return { type: 'ATTACK', target: enemyPos, moveTarget: moveTarget, score: 2.0, movementMode: shouldAdvance ? 'BOUNDING' : 'TACTICAL' };
        }
    }

    scoreSuppress(world) {
        const memoryHostiles = this.agent.memory.knownHostiles;
        let baseScore = 0;
        let targetPos = null;

        // Check for "Cover Me" signal 
        const inChaos = world.commandChaos && world.commandChaos[this.agent.team] > 0;
        const anyoneAdvancing = !inChaos && world.agents.some(a => 
            a.team === this.agent.team && 
            a !== this.agent && 
            (Date.now() - (a.lastAdvanceTime || 0) < 1000)
        );

        if (memoryHostiles.length > 0) {
            const latest = memoryHostiles[0];
            const age = Date.now() - latest.timestamp;
            if (age < 5000) {
                const dist = Utils.distance(this.agent.pos, latest.lastKnownPosition);
                if (dist < this.agent.state.inventory.weapon.range * 1.2) {
                    const timeFactor = Math.max(0, 1 - age / 10000);
                    baseScore = timeFactor * (1.5 - this.agent.traits.agreeableness);
                    targetPos = latest.lastKnownPosition;
                }
            }
        }
        
        if (!targetPos) {
            const mem = this.agent.memory;
            const heatmap = mem.heatmap;
            let maxHeat = 0;
            const gx = Math.floor((this.agent.pos.x / world.width) * mem.gridCols);
            const gy = Math.floor((this.agent.pos.y / world.height) * mem.gridRows);
            
            for(let y = Math.max(0, gy-2); y <= Math.min(mem.gridRows-1, gy+2); y++) {
                for(let x = Math.max(0, gx-2); x <= Math.min(mem.gridCols-1, gx+2); x++) {
                    const heat = heatmap[y][x];
                    if (heat > 3) {
                         const cellPos = { 
                            x: (x + 0.5) * (world.width / mem.gridCols), 
                            y: (y + 0.5) * (world.height / mem.gridRows) 
                        };
                        const dist = Utils.distance(this.agent.pos, cellPos);
                        if (dist < this.agent.state.inventory.weapon.range && heat > maxHeat) {
                             maxHeat = heat;
                             targetPos = cellPos;
                        }
                    }
                }
            }
            if (targetPos) baseScore = (maxHeat / 10) * (1.2 - this.agent.traits.agreeableness);
        }
        
        if (targetPos) {
            // VALIDATE LINE OF FIRE
            // Ensure we aren't shooting a solid wall 
            const dist = Utils.distance(this.agent.pos, targetPos);
            const angle = Utils.angle(this.agent.pos, targetPos);
            const wallDist = world.getRayDistance(this.agent.pos, angle, dist + 10);
            
            if (wallDist < dist - 10) {
                // Wall blocks LOF significantly before target
                return { score: 0 };
            }

            // WEAPON INFLUENCE
            // LMGs (High Capacity) are suppression machines
            const capacity = this.agent.state.inventory.weapon.capacity || 30;
            if (capacity > 60) baseScore *= 2.0;
            if (capacity > 25) baseScore *= 1.2;
            
            // TRAIT INFLUENCE
            baseScore += (this.agent.traits.agreeableness * 1.5);

            // BOUNDING OVERWATCH BOOST
            if (anyoneAdvancing) {
                baseScore += (1.0 + this.agent.traits.agreeableness + this.agent.traits.conscientiousness);
            }

            // DISTRESS SIGNAL BOOST
            for (const [id, signal] of this.agent.memory.distressSignals) {
                if (signal.type === 'NEED_COVER') {
                    const distToAlly = Utils.distance(this.agent.pos, signal.position);
                    if (distToAlly < 400) {
                        baseScore += (1.5 + this.agent.traits.agreeableness);
                        if (!targetPos) targetPos = signal.position;
                    }
                }
            }
            
            // SMOKE SUPPRESSION (Recon by Fire)
            let isBlindFire = false;
            if (world.smokes) {
                for (const smoke of world.smokes) {
                    const distToSmoke = Utils.distance(this.agent.pos, smoke);
                    if (distToSmoke > this.agent.state.inventory.weapon.range) continue;

                    // If we have a targetPos, check if smoke is near it
                    if (targetPos) {
                        const distToEnemy = Utils.distance(smoke, targetPos);
                        if (distToEnemy < smoke.radius + 30) {
                            baseScore += 3.0; 
                            isBlindFire = true;
                            break;
                        }
                    } else {
                        // NO KNOWN TARGET: Should we blind fire into the smoke anyway?
                        // If the smoke is fresh (< 5s) and in a direction we expect enemies (Heat)
                        const smokeAge = Date.now() - (smoke.timestamp || 0);
                        const mem = this.agent.memory;
                        const gx = Math.floor((smoke.x / world.width) * mem.gridCols);
                        const gy = Math.floor((smoke.y / world.height) * mem.gridRows);
                        const areaHeat = (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) ? mem.heatmap[gy][gx] : 0;

                        if (areaHeat > 2 || smokeAge < 5000) {
                            targetPos = { x: smoke.x, y: smoke.y };
                            baseScore = 1.5 + (areaHeat * 0.5);
                            isBlindFire = true;
                            break;
                        }
                    }
                }
            }
            
            // BUSH SUPPRESSION (Recon by Fire)
            if (!isBlindFire && world.bushes) {
                for (const bush of world.bushes) {
                    const distToBush = Utils.distance(this.agent.pos, bush);
                    if (distToBush > this.agent.state.inventory.weapon.range) continue;

                    const mem = this.agent.memory;
                    const gx = Math.floor((bush.x / world.width) * mem.gridCols);
                    const gy = Math.floor((bush.y / world.height) * mem.gridRows);
                    const bushHeat = (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) ? mem.heatmap[gy][gx] : 0;

                    // If a bush has high heat, it's a prime target for suppression
                    if (bushHeat > 4) {
                        targetPos = { x: bush.x, y: bush.y };
                        baseScore = 1.2 + (bushHeat * 0.4);
                        isBlindFire = true;
                        break;
                    }
                }
            }
            
            if (baseScore > 0.8 && targetPos) {
                return { type: 'SUPPRESS', target: targetPos, score: baseScore, blindFire: isBlindFire };
            }
        }

        return { score: 0 };
    }

    scoreFrag(world) {
        if (Date.now() - (this.agent.lastFragTime || 0) < 10000) return { score: 0 };
        
        const inventory = this.agent.state.inventory.utility;
        const hasFrag = inventory.some(u => u.type === 'FragGrenade' && u.count > 0);
        if (!hasFrag) return { score: 0 };

        const enemy = this.decision.getThreatSource(world, true);
        if (!enemy) return { score: 0 };
        
        const enemyPos = enemy.lastKnownPosition || enemy.pos;
        const dist = Utils.distance(this.agent.pos, enemyPos);
        
        if (dist > 80 && dist < Config.PHYSICS.GRENADE_RANGE) {
            const hasLOS = enemy.id !== undefined ? world.hasLineOfSight(this.agent.pos, enemyPos) : false;
            let fragScore = 1.0;

            // 1. TARGET SELECTION (Clustering)
            const clusterRadius = Config.PHYSICS.FRAG_RADIUS * 1.5;
            const knownEnemies = this.agent.memory.knownHostiles.filter(h => 
                Utils.distance(h.lastKnownPosition, enemyPos) < clusterRadius
            );
            fragScore += (knownEnemies.length - 1) * 1.5; // High priority for groups

            // 2. FLUSHING LOGIC (Anti-Cover)
            const targetInCover = Array.from(this.agent.memory.discoveredCovers).some(c => 
                enemyPos.x >= c.x - 10 && enemyPos.x <= c.x + c.w + 10 &&
                enemyPos.y >= c.y - 10 && enemyPos.y <= c.y + c.h + 10
            );
            if (targetInCover) fragScore += 2.0;

            // 3. SAFETY CHECK (Conscientiousness)
            const alliesInDanger = world.agents.some(a => 
                a.team === this.agent.team && !a.isCover &&
                Utils.distance(a.pos, enemyPos) < clusterRadius + 30
            );
            if (alliesInDanger) {
                if (this.agent.traits.conscientiousness > 0.3) fragScore -= 10.0; 
                else fragScore -= 2.0; 
            }

            // 4. TRAIT MODIFIERS
            if (this.agent.traits.neuroticism < 0.4) fragScore *= 1.3;
            if (this.agent.traits.extraversion > 0.7) fragScore *= 1.2;

            // 5. BLIND FIRE BONUS
            if (!hasLOS) fragScore *= 1.4; 

            if (fragScore > 1.8) {
                return { type: 'THROW', target: enemyPos, grenadeType: 'FragGrenade', score: fragScore };
            }
        }
        return { score: 0 };
    }

    scoreSmoke(world) {
        if (Date.now() - (this.agent.lastSmokeTime || 0) < 12000) return { score: 0 };

        const inventory = this.agent.state.inventory.utility;
        const hasSmoke = inventory.some(u => u.type === 'SmokeGrenade' && u.count > 0);
        if (!hasSmoke) return { score: 0 };

        const enemy = this.decision.getThreatSource(world, true);
        if (!enemy) return { score: 0 };
        
        const enemyPos = enemy.lastKnownPosition || enemy.pos;
        const dist = Utils.distance(this.agent.pos, enemyPos);

        if (dist > 60 && dist < Config.PHYSICS.GRENADE_RANGE) {
            let smokeScore = 0.5;
            let smokeTarget = null;

            // 1. MEDICAL SMOKE (Rescue)
            const signals = Array.from(this.agent.memory.distressSignals.values());
            const distressedAlly = signals.find(s => s.type === 'MEDIC' && Utils.distance(this.agent.pos, s.position) < Config.PHYSICS.GRENADE_RANGE);
            if (distressedAlly) {
                smokeScore = 4.5;
                const enemyAngle = Utils.angle(distressedAlly.position, enemyPos);
                smokeTarget = {
                    x: distressedAlly.position.x + Math.cos(enemyAngle) * 40,
                    y: distressedAlly.position.y + Math.sin(enemyAngle) * 40
                };
            }

            // 2. DEFENSIVE SMOKE (Escape/Pinned)
            if (smokeScore < 3.0 && (this.agent.state.suppression > 60 || this.agent.state.hp < this.agent.state.maxHp * 0.4)) {
                smokeScore = 3.5;
                smokeTarget = {
                    x: (this.agent.pos.x + enemyPos.x) / 2,
                    y: (this.agent.pos.y + enemyPos.y) / 2
                };
            }

            // 3. OFFENSIVE SMOKE (Obscuration)
            if (smokeScore < 2.0 && this.agent.traits.openness > 0.6) {
                smokeScore = 2.2;
                smokeTarget = enemyPos; 
            }

            if (smokeScore > 1.8 && smokeTarget) {
                return { type: 'THROW', target: smokeTarget, grenadeType: 'SmokeGrenade', score: smokeScore };
            }
        }
        return { score: 0 };
    }
}
