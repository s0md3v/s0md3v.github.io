import { Utils } from './Utils.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';

export class CombatEvaluator {
    constructor(decisionModule) {
        this.decision = decisionModule;
        this.agent = decisionModule.agent;
    }

    scoreCombat(world) {
        // Accurate ATTACK fire is reserved for a contact the shooter can currently
        // see. Remembered and inferred contacts are handled by scoreSuppress().
        const enemy = this.decision.getThreatSource(world, false);
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
                const hasLOS = world.hasVisualLine(this.agent.pos, enemyPos);

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
                const hasLOS = world.hasVisualLine(this.agent.pos, enemyPos);
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
             const hasLOS = world.hasVisualLine(this.agent.pos, enemyPos);
             
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
        const now = Date.now();
        const memory = this.agent.memory;
        const weapon = this.agent.state.inventory.weapon;
        if (!weapon || weapon.range <= 0) return { score: 0 };

        const capacity = Math.max(1, weapon.capacity || weapon.maxAmmo || 1);
        const totalRounds = (weapon.ammo || 0) + (weapon.carriedAmmo || 0);
        if (totalRounds < Math.max(3, capacity * 0.35)) return { score: 0 };

        const inChaos = world.commandChaos && world.commandChaos[this.agent.team] > 0;
        const anyoneAdvancing = !inChaos && world.agents.some(a => 
            a.team === this.agent.team && 
            a !== this.agent && 
            !a.state.isDead &&
            (now - (a.lastAdvanceTime || 0) < 1200)
        );
        const coverRequested = [...memory.distressSignals.values()].some(signal =>
            (signal.type === 'NEED_COVER' || signal.type === 'PINNED') &&
            now - signal.timestamp < 5000 &&
            Utils.distance(this.agent.pos, signal.position) < 450
        );
        const urgent = anyoneAdvancing || coverRequested || this.agent.state.isPinned;
        const visibleIds = new Set(this.agent.sensory.scan(world)
            .filter(other => other.team !== this.agent.team)
            .map(other => other.id));
        if (visibleIds.size > 0) return { score: 0 };
        const candidates = [];

        const addEvidence = (target, confidence, details) => {
            if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
            const dist = Utils.distance(this.agent.pos, target);
            if (dist < 35 || dist > weapon.range) return;

            const intel = this._getIntelAt(world, target);
            let adjusted = Utils.clamp(confidence, 0, 0.98);
            if (details.canBeVisuallyCleared !== false && intel.observedAge < 500) adjusted *= 0.15;
            adjusted *= 1 - Math.min(0.75, intel.control / 12);
            if (adjusted < 0.12) return;

            const existing = candidates.find(candidate => Utils.distance(candidate.target, target) < 48);
            if (existing) {
                existing.confidence = 1 - ((1 - existing.confidence) * (1 - adjusted));
                existing.latestTimestamp = Math.max(existing.latestTimestamp || 0, details.timestamp || 0);
                existing.uncertainty = Math.max(existing.uncertainty || 0, details.uncertainty || 0);
                if (adjusted > existing.primaryConfidence) {
                    existing.primaryConfidence = adjusted;
                    existing.reason = details.reason;
                    existing.description = details.description;
                    existing.callout = details.callout;
                }
                return;
            }

            candidates.push({
                target: { x: target.x, y: target.y },
                confidence: adjusted,
                primaryConfidence: adjusted,
                latestTimestamp: details.timestamp || 0,
                uncertainty: details.uncertainty || 20,
                reason: details.reason,
                description: details.description,
                callout: details.callout
            });
        };

        // A recently lost visual contact is the strongest ordinary reason to put
        // a finite burst into its last occupied position.
        memory.knownHostiles.forEach(hostile => {
            if (visibleIds.has(hostile.id)) return;
            const age = now - hostile.timestamp;
            if (age < 0 || age > 9000) return;
            const confidence = (hostile.confidence ?? 1) * Math.exp(-age / 3600);
            addEvidence(hostile.lastKnownPosition, confidence, {
                reason: 'LAST_CONTACT',
                description: 'suppressing last contact',
                callout: 'SUPPRESSING LAST CONTACT!',
                timestamp: hostile.timestamp,
                uncertainty: Math.min(58, 12 + age * 0.007)
            });
        });

        // Sound and shared reports retain their type, so a footstep is weaker and
        // shorter-lived than a hostile weapon report or teammate callout.
        memory.dangerZones.forEach(cue => {
            if (cue.sourceTeam === this.agent.team && cue.type !== 'CALLOUT') return;
            const age = now - cue.timestamp;
            if (age < 0) return;

            let confidence = 0;
            let decay = 2000;
            let details = null;
            const audible = Utils.clamp((cue.intensity || 0) / 25, 0, 1);

            if (cue.type === 'GUNSHOT' && age < 5500) {
                confidence = (0.45 + audible * 0.35) * (cue.sourceTeam == null ? 0.75 : 1);
                decay = 2300;
                details = ['HOSTILE_GUNSHOT', 'firing on hostile gunshot', 'FIRING ON THAT GUN!'];
            } else if ((cue.type === 'RUSTLE' || cue.type === 'STEP') && age < 2800) {
                confidence = (cue.type === 'RUSTLE' ? 0.40 : 0.32) * (cue.sourceTeam == null ? 0.75 : 1);
                decay = 1500;
                details = ['MOVEMENT_CUE', 'probing movement cue', 'MOVEMENT!'];
            } else if (cue.type === 'SHOUT' && age < 4000) {
                confidence = 0.48 * (cue.sourceTeam == null ? 0.7 : 1);
                decay = 2100;
                details = ['HOSTILE_SHOUT', 'firing on hostile call', 'VOICE, THAT SECTOR!'];
            } else if (cue.type === 'CALLOUT' && age < 6500) {
                confidence = cue.confidence || 0.7;
                decay = 5000;
                details = ['CALLOUT', 'covering shared contact', 'COVERING THE CONTACT!'];
            } else if (cue.type === 'RADIO' && age < 8000) {
                confidence = cue.confidence || 0.5;
                decay = 6500;
                details = ['RADIO', 'covering radio contact', 'COVERING REPORTED SECTOR!'];
            }

            if (!details) return;
            addEvidence(cue, confidence * Math.exp(-age / decay), {
                reason: details[0],
                description: details[1],
                callout: details[2],
                timestamp: cue.timestamp,
                uncertainty: cue.type === 'RADIO' ? 55 : (cue.type === 'CALLOUT' ? 42 : 30)
            });
        });

        // Near misses provide a bearing rather than a target. Project that bearing
        // only as far as the weapon can safely reach before hard geometry.
        this.agent.state.suppressionSources.forEach(source => {
            const age = now - source.time;
            if (!Number.isFinite(source.angle) || age < 0 || age > 2300) return;
            const desiredDist = weapon.range * 0.78;
            const clearDist = world.getClearShotDistance(this.agent.pos, source.angle, desiredDist);
            const targetDist = Math.min(desiredDist, clearDist - 8);
            if (targetDist < 55) return;
            addEvidence({
                x: this.agent.pos.x + Math.cos(source.angle) * targetDist,
                y: this.agent.pos.y + Math.sin(source.angle) * targetDist
            }, 0.88 * Math.exp(-age / 1700), {
                reason: 'INCOMING_BEARING',
                description: 'returning fire by bearing',
                callout: 'RETURNING FIRE!',
                timestamp: source.time,
                uncertainty: 34,
                canBeVisuallyCleared: false
            });
        });

        // Heat is deliberately the weakest source, but the entire weapon-radius
        // intelligence map is considered. Recently cleared and friendly-held cells
        // have already been discounted above.
        const heatCells = [];
        const cellWidth = world.width / memory.gridCols;
        const cellHeight = world.height / memory.gridRows;
        for (let gy = 0; gy < memory.gridRows; gy++) {
            for (let gx = 0; gx < memory.gridCols; gx++) {
                const heat = memory.heatmap[gy][gx];
                if (heat < 1.75) continue;
                const target = { x: (gx + 0.5) * cellWidth, y: (gy + 0.5) * cellHeight };
                if (Utils.distance(this.agent.pos, target) > weapon.range) continue;
                const observedAge = now - memory.observedMap[gy][gx];
                if (observedAge < 650) continue;
                const control = memory.controlMap[gy][gx];
                const confidence = Math.min(0.55, 0.18 + heat * 0.055) * (1 - Math.min(0.8, control / 10));
                heatCells.push({ target, confidence, heat });
            }
        }
        heatCells.sort((a, b) => b.confidence - a.confidence).slice(0, 12).forEach(cell => {
            addEvidence(cell.target, cell.confidence, {
                reason: 'SUSPECTED_SECTOR',
                description: 'probing suspected sector',
                callout: 'COVERING THAT SECTOR!',
                uncertainty: 48
            });
        });

        // Concealment adds tactical value to evidence; it never manufactures it.
        candidates.forEach(candidate => {
            const smoke = (world.smokes || [])
                .filter(area => Utils.distance(this.agent.pos, area) <= weapon.range)
                .map(area => ({ area, proximity: Utils.distance(candidate.target, area) - area.radius }))
                .filter(entry => entry.proximity < 55)
                .sort((a, b) => a.proximity - b.proximity)[0]?.area;
            const bush = (world.bushes || [])
                .filter(area => Utils.distance(this.agent.pos, area) <= weapon.range)
                .map(area => ({ area, proximity: Utils.distance(candidate.target, area) - (area.radius || 16) }))
                .filter(entry => entry.proximity < 45)
                .sort((a, b) => a.proximity - b.proximity)[0]?.area;

            const smokeFit = smoke ? Utils.distance(candidate.target, smoke) / Math.max(1, smoke.radius) : Infinity;
            const bushFit = bush ? Utils.distance(candidate.target, bush) / Math.max(1, bush.radius || 16) : Infinity;
            if (smokeFit <= bushFit && smoke) {
                candidate.target = { x: smoke.x, y: smoke.y };
                candidate.confidence = 1 - ((1 - candidate.confidence) * 0.88);
                candidate.uncertainty = Math.max(candidate.uncertainty, smoke.radius * 0.8);
                candidate.reason = 'SMOKE';
                candidate.description = 'probing smoke around hostile evidence';
                candidate.callout = 'CONTACT IN THE SMOKE!';
            } else if (bush) {
                candidate.target = { x: bush.x, y: bush.y };
                candidate.confidence = 1 - ((1 - candidate.confidence) * 0.92);
                candidate.uncertainty = Math.max(candidate.uncertainty, (bush.radius || 16) * 0.7);
                candidate.reason = 'BUSH';
                candidate.description = 'probing vegetation around hostile evidence';
                candidate.callout = 'MOVEMENT IN THE BRUSH!';
            }
        });

        const weaponSuitability = weapon.type === 'LMG' ? 0.65
            : weapon.type === 'Rifle' ? 0.08
                : weapon.type === 'Pistol' ? -0.35
                    : weapon.type === 'Shotgun' ? -0.45
                        : -0.25;
        const reserveMags = totalRounds / capacity;
        const ammoAbundance = Utils.clamp((reserveMags - 1) / 4, 0, 1);
        const lowReserve = totalRounds <= capacity * 1.25;
        const ammoPenalty = lowReserve ? (urgent ? 0.35 : 1.15) : (totalRounds <= capacity * 2 ? 0.35 : 0);
        const confidenceFloor = Math.max(
            0.18,
            0.26 + this.agent.traits.conscientiousness * 0.12 - (urgent ? 0.06 : 0) - ammoAbundance * 0.06
        );
        const valid = [];

        candidates.forEach(candidate => {
            const dist = Utils.distance(this.agent.pos, candidate.target);
            if (candidate.confidence < confidenceFloor || dist < 35 || dist > weapon.range) return;
            if (!world.hasClearShot(this.agent.pos, candidate.target, weapon.range)) return;

            const areaRadius = Math.max(24, Math.min(62, candidate.uncertainty + 10));
            const friendlyInTargetArea = world.agents.some(other =>
                other !== this.agent && other.team === this.agent.team && !other.state.isDead &&
                Utils.distance(other.pos, candidate.target) < areaRadius
            );
            if (friendlyInTargetArea) return;

            const laneMargin = 5 + Math.min(18, candidate.uncertainty * 0.22);
            if (this._hasFriendlyFireRisk(world, candidate.target, laneMargin)) return;

            const duplicateSuppressors = world.agents.filter(other =>
                other !== this.agent && other.team === this.agent.team && !other.state.isDead &&
                other.currentAction?.type === 'SUPPRESS' && other.currentAction.target &&
                Utils.distance(other.currentAction.target, candidate.target) < 72
            ).length;
            if (duplicateSuppressors >= 2) return;

            const tacticalNeed = (anyoneAdvancing ? 0.65 + this.agent.traits.agreeableness * 0.45 : 0)
                + (coverRequested ? 0.55 : 0)
                + (this.agent.state.isPinned ? 0.5 : 0);
            const score = 0.45 + candidate.confidence * 2.35 + tacticalNeed + weaponSuitability + ammoAbundance * 0.55
                - ammoPenalty - duplicateSuppressors * 0.38;
            if (score < 1.05 || (lowReserve && !urgent && candidate.confidence < 0.72)) return;

            let maxBursts = 1;
            if (candidate.confidence > 0.5) maxBursts++;
            if (candidate.confidence > 0.74) maxBursts++;
            if (weapon.type === 'LMG') maxBursts++;
            if (ammoAbundance > 0.72 && candidate.confidence > 0.45) maxBursts++;
            if (lowReserve) maxBursts = 1;
            maxBursts = Math.min(4, maxBursts);

            const areaKey = `area:${Math.round(candidate.target.x / 40)}:${Math.round(candidate.target.y / 40)}`;
            const fireControl = this.agent.actionExecutor?.suppressionFireControl;
            const refreshed = !fireControl || fireControl.key !== areaKey
                || candidate.latestTimestamp > (fireControl.evidenceTimestamp || 0) + 800;
            if (!refreshed && fireControl.burstsFired >= maxBursts) return;

            valid.push({
                ...candidate,
                score,
                maxBursts,
                areaKey,
                spreadMultiplier: Utils.clamp(1.8 + candidate.uncertainty / 45, 2, 3.2)
            });
        });

        valid.sort((a, b) => b.score - a.score);
        const best = valid[0];
        if (!best) return { score: 0 };

        return {
            type: 'SUPPRESS',
            target: best.target,
            score: best.score,
            blindFire: true,
            reason: best.reason,
            description: best.description,
            callout: best.callout,
            confidence: best.confidence,
            evidenceTimestamp: best.latestTimestamp,
            areaKey: best.areaKey,
            maxBursts: best.maxBursts,
            sweepRadius: best.uncertainty,
            spreadMultiplier: best.spreadMultiplier,
            movementMode: 'COVERING'
        };
    }

    _getIntelAt(world, pos) {
        const memory = this.agent.memory;
        const gx = Math.floor((pos.x / world.width) * memory.gridCols);
        const gy = Math.floor((pos.y / world.height) * memory.gridRows);
        if (gx < 0 || gx >= memory.gridCols || gy < 0 || gy >= memory.gridRows) {
            return { heat: 0, control: 0, observedAge: Infinity };
        }
        return {
            heat: memory.heatmap[gy][gx],
            control: memory.controlMap[gy][gx],
            observedAge: Date.now() - memory.observedMap[gy][gx]
        };
    }

    _hasFriendlyFireRisk(world, target, margin) {
        const weapon = this.agent.state.inventory.weapon;
        const angle = Utils.angle(this.agent.pos, target);
        const clearDistance = Math.min(
            weapon.range,
            world.getClearShotDistance(this.agent.pos, angle, weapon.range)
        );
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return world.agents.some(other => {
            if (other === this.agent || other.team !== this.agent.team || other.state.isDead) return false;
            const dx = other.pos.x - this.agent.pos.x;
            const dy = other.pos.y - this.agent.pos.y;
            const along = dx * cos + dy * sin;
            if (along <= 18 || along > clearDistance) return false;
            const lateral = Math.abs(-dx * sin + dy * cos);
            return lateral < other.radius + margin;
        });
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
            const hasLOS = enemy.id !== undefined ? world.hasVisualLine(this.agent.pos, enemyPos) : false;
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
