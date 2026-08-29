import { Utils } from './Utils.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';
import { Projectile } from './Projectile.js?v=field-console-14';

export class ActionExecutor {
    constructor(agent) {
        this.agent = agent;
        this.lastSelfHealTime = 0;
        this.lastHealTime = 0;
        this.lastResupplyTime = 0;
        this.suppressionFireControl = {
            key: null,
            evidenceTimestamp: 0,
            burstsFired: 0,
            roundsRemaining: 0,
            nextBurstAt: 0,
            aimPoint: null,
            announced: false,
            lastAnnouncementKey: null,
            lastAnnouncementAt: 0
        };
    }

    execute(action, dt, world) {
        if (!action) return;
        let turnSpeed = Config.AGENT.TURN_SPEED;
        const now = Date.now();

        // Pulling a pin is a committed action. Keep executing the captured throw
        // instead of allowing the next 100 ms decision tick to orphan the grenade.
        if (this.agent.armingUntil > 0 && this.agent.armingAction) {
            action = this.agent.armingAction;
        }

        // Pinned/Arming Effect: Cannot Move
        if (this.agent.state.isPinned || this.agent.armingUntil > now) {
            turnSpeed *= 0.5;
            if (Math.random() < 0.05) this.agent.state.modifyStress(5); // Panic while pinned
            
            // If pinned, we might blind fire (SUPPRESS) instead of aimed fire
            if (this.agent.state.isPinned && action.type === 'ATTACK') {
                const memoryContact = action.targetId !== undefined
                    ? this.agent.memory.knownHostiles.find(hostile => hostile.id === action.targetId)
                    : null;
                const memoryTarget = memoryContact?.lastKnownPosition;
                const target = action.target || memoryTarget;
                action = {
                    ...action,
                    type: 'SUPPRESS',
                    target,
                    blindFire: true,
                    reason: 'PINNED_CONTACT',
                    description: 'returning fire while pinned',
                    callout: 'RETURNING FIRE!',
                    confidence: 0.8,
                    evidenceTimestamp: memoryContact?.timestamp || 0,
                    areaKey: target ? `area:${Math.round(target.x / 40)}:${Math.round(target.y / 40)}` : null,
                    maxBursts: this.agent.state.inventory.weapon.type === 'LMG' ? 3 : 2,
                    sweepRadius: 30,
                    spreadMultiplier: 2.8
                };
            }
        }

        // Systematic Reflexive Behavior
        const isStressed = this.agent.state.stress > 60;
        const canSnap = isStressed && Math.random() < Config.AGENT.PANIC_SNAP_PROB;

        if (action.type === 'ATTACK' || action.type === 'SUPPRESS') turnSpeed = 2.0;

        switch(action.type) {
            case 'IDLE':
                this.executeIdle(dt, world);
                break;
            case 'HOLD':
                this.agent.isMoving = false;
                this.agent.path = [];
                this.agent.lastPathTarget = null;
                this.executeIdle(dt, world);
                break;
            case 'MOVE':
            case 'SUPPORT':
            case 'INTERCEPT':
                if (action.target && !this.agent.state.isPinned) {
                    let speedMod = 1.0;
                    if (this.agent.state.inSmoke) {
                         speedMod = 0.6; // Disorientation
                    }

                    // Apply the movement mode chosen with this action.
                    if (action.movementMode) {
                        this.agent.movementMode = action.movementMode;
                    }

                    let lookPos = null;
                    // TACTICAL MOVEMENT: Look around while moving
                    if (this.agent.movementMode === 'TACTICAL' || this.agent.movementMode === 'COVERING') {
                        // Optimization: Check infrequently
                        if (!this.agent.cachedLookPos || Math.random() < 0.1) {
                            const gazeAngle = this.agent.sensory.calculateTacticalGaze(world);
                            this.agent.cachedLookPos = {
                                x: this.agent.pos.x + Math.cos(gazeAngle) * 500,
                                y: this.agent.pos.y + Math.sin(gazeAngle) * 500
                            };
                        }
                        lookPos = this.agent.cachedLookPos;
                    }
                    
                    this.agent.moveTo(action.target, dt, world, turnSpeed, speedMod, lookPos);
                }
                break;
            case 'LOOT':
                this.executeLoot(action, dt, world, turnSpeed);
                break;
            case 'THROW':
                this.executeThrow(action, dt, world, turnSpeed, canSnap);
                break;
            case 'SELF_HEAL':
                this.executeSelfHeal();
                break;
            case 'HEAL':
                this.executeHeal(action, dt, world, turnSpeed);
                break;
            case 'RESUPPLY':
                this.executeResupply(action, dt, world, turnSpeed);
                break;
            case 'ATTACK':
                this.executeAttack(action, dt, world, turnSpeed, canSnap);
                break;
            case 'SUPPRESS':
                this.executeSuppress(action, dt, world, turnSpeed, canSnap);
                break;
            case 'RETREAT':
                this.executeRetreat(action, dt, world, turnSpeed);
                break;
            case 'MUTINY':
                this.executeMutiny(action, dt, world, turnSpeed);
                break;
        }

        this.agent.pos.x = Utils.clamp(this.agent.pos.x, 0, world.width);
        this.agent.pos.y = Utils.clamp(this.agent.pos.y, 0, world.height);
    }

    executeIdle(dt, world) {
        this.agent.idleLookTimer -= dt;
        if (this.agent.idleLookTimer <= 0) {
            this.agent.idleLookTimer = 800 + Math.random() * 700;
            
            // SMART IDLE: Look at meaningful sectors
            const tacticalAngle = this.agent.sensory.calculateTacticalGaze(world);
            
            // Add slight randomness so they don't look like robots
            this.agent.targetAngle = tacticalAngle + (Math.random() - 0.5) * 0.3;
        }
        this.agent.rotateTowards(this.agent.targetAngle, dt, Config.AGENT.TURN_SPEED * 0.5);
    }

    executeLoot(action, dt, world, turnSpeed) {
        if (!action.target) return;

        const dist = Utils.distance(this.agent.pos, action.target);

        
        if (dist < 30) {
            const idx = world.loot.findIndex(l => 
                l === action.target || 
                (l.x === action.target.x && l.y === action.target.y)
            );
            if (idx > -1) {
                const item = world.loot.splice(idx, 1)[0];
                this.agent.state.morale = Math.min(100, this.agent.state.morale + 15);
                this.agent.targetPos = null;
                
                this.agent.memory.knownLoot = this.agent.memory.knownLoot.filter(l => l.x !== item.x || l.y !== item.y);

                if (item.type === 'Medkit') {
                    const kits = this.agent.state.inventory.utility.find(u => u.type === 'Medkit');
                    if (kits) kits.count += 2; 
                    this.agent.state.hp = Math.min(this.agent.state.maxHp, this.agent.state.hp + 2);
                } else if (item.type === 'WeaponCrate') {
                    this.agent.state.inventory[this.agent.state.inventory.currentEntry] = {
                        name: 'Special Gun', type: 'Special', visualType: 'rifle',
                        range: 500, optimalRange: 250, projectileSpeed: 700, fireRate: 300,
                        damage: 3, capacity: 60, ammo: 60, maxAmmo: 60, carriedAmmo: 120, spread: 0.04
                    };
                    const frags = this.agent.state.inventory.utility.find(u => u.type === 'FragGrenade');
                    if (frags) frags.count++;
                } else if (item.type === 'AmmoCrate') {
                    const weapon = this.agent.state.inventory.weapon;
                    weapon.ammo = weapon.maxAmmo;
                    weapon.carriedAmmo += (weapon.maxAmmo * 2);
                    this.agent.state.inventory.utility.forEach(u => u.count++);
                }
            }
        } else {
            const pathFound = this.agent.moveTo(action.target, dt, world, turnSpeed);
            
            // If we are significantly far and pathfinding failed to even get us started
            if (!pathFound && dist > 100 && (!this.agent.path || this.agent.path.length === 0)) {
                this.agent.memory.markUnreachable(action.target);
                this.agent.currentAction = { type: 'IDLE', score: 0 };
            }
        }
    }

    executeThrow(action, dt, world, turnSpeed, canSnap) {
        const gType = action.grenadeType || 'FragGrenade';
        const gIdx = this.agent.state.inventory.utility.findIndex(u => u.type === gType && u.count > 0);
        
        if (gIdx > -1 && action.target) {
            const now = Date.now();
            
            if (this.agent.armingUntil === 0) {
                this.agent.armingUntil = now + Config.PHYSICS.GRENADE_ARM_TIME;
                this.agent.armingAction = action;
                this.agent.addBark(gType === 'SmokeGrenade' ? "DEPLOYING SMOKE!" : "PREPPING FRAG!");
                return;
            }

            const targetAngle = Utils.angle(this.agent.pos, action.target);
            const turnSpeedBonus = 2.0; 
            this.agent.rotateTowards(targetAngle, dt, turnSpeed * turnSpeedBonus, canSnap);

            if (now >= this.agent.armingUntil) {
                this.agent.state.inventory.utility[gIdx].count--;
                this.agent.lastThrowTime = now;
                if (gType === 'FragGrenade') this.agent.lastFragTime = now;
                if (gType === 'SmokeGrenade') this.agent.lastSmokeTime = now;
                
                this.agent.armingUntil = 0;
                this.agent.armingAction = null;
                
                this.agent.addBark(gType === 'SmokeGrenade' ? "SMOKE OUT!" : "FRAG OUT!");
                
                const pType = (gType === 'SmokeGrenade') ? 'SMOKE' : 'GRENADE';
                const pRadius = (pType === 'SMOKE') ? Config.PHYSICS.SMOKE_RADIUS : Config.PHYSICS.FRAG_RADIUS;
                const startingCovers = this.agent.getCurrentCovers(world);

                // --- CALCUALTE THROW INACCURACY ---
                const dist = Utils.distance(this.agent.pos, action.target);
                const hasLOS = world.hasVisualLine(this.agent.pos, action.target);
                
                // Base error: 10% of distance + fixed minimum
                let errorRadius = (dist * 0.1) + 5;
                
                // Stress impact: Panic ruins aim (up to 3x error)
                // Neuroticism makes stress worse
                const stressFactor = 1.0 + (this.agent.state.stress / 100) * (1.0 + this.agent.traits.neuroticism) * 2.0;
                errorRadius *= stressFactor;
                
                // Blind Throw: Doubling error if throwing over a wall/smoke
                if (!hasLOS) errorRadius *= 2.0;

                // Apply error to target
                const errorAngle = Math.random() * Math.PI * 2;
                const errorDist = Math.random() * errorRadius;
                const randomizedTarget = {
                    x: action.target.x + Math.cos(errorAngle) * errorDist,
                    y: action.target.y + Math.sin(errorAngle) * errorDist
                };

                const handForwardOffset = 7.0;
                const handSideOffset = 4.0;
                const throwX = this.agent.pos.x + Math.cos(this.agent.angle) * handForwardOffset - Math.sin(this.agent.angle) * handSideOffset;
                const throwY = this.agent.pos.y + Math.sin(this.agent.angle) * handForwardOffset + Math.cos(this.agent.angle) * handSideOffset;

                const p = new Projectile(
                    this.agent.id, this.agent.team, throwX, throwY, 
                    this.agent.angle, 0, pRadius, pType,
                    startingCovers, randomizedTarget
                );
                
                if (dist < 150) {
                     p.fuse -= 1000;
                }

                p.damage = (pType === 'SMOKE') ? 0 : Config.PHYSICS.FRAG_DAMAGE; 
                world.projectiles.push(p);

                // Chained action support
                if (action.nextAction) {
                    this.agent.currentAction = action.nextAction;
                }
            }
        } else {
            this.agent.armingUntil = 0;
            this.agent.armingAction = null;
        }
    }

    executeSelfHeal() {
        const now = Date.now();
        if (now - this.lastSelfHealTime < 1000 || this.agent.state.hp >= this.agent.state.maxHp) return;

        const medkitIdx = this.agent.state.inventory.utility.findIndex(u => u.type === 'Medkit' && u.count > 0);
        if (medkitIdx > -1) {
            this.lastSelfHealTime = now;
            this.agent.state.inventory.utility[medkitIdx].count--;
            const healingAmount = this.agent.role === 'MEDIC' ? this.agent.state.maxHp : this.agent.state.maxHp * 0.5;
            this.agent.state.hp = Math.min(this.agent.state.maxHp, this.agent.state.hp + healingAmount);
            this.agent.state.modifyStress(-30);
            this.agent.addBark("APPLYING FIRST AID");
        }
    }

    executeHeal(action, dt, world, turnSpeed) {
        if (action.targetId === undefined) return;

        const patient = world.agents.find(a => a.id === action.targetId);
        if (patient && Utils.distance(this.agent.pos, patient.pos) < 35) {
            const now = Date.now();
            if (now - this.lastHealTime < 1000 || patient.state.hp >= patient.state.maxHp) return;
            const medkitIdx = this.agent.state.inventory.utility.findIndex(u => u.type === 'Medkit' && u.count > 0);
            if (medkitIdx > -1) {
                this.lastHealTime = now;
                this.agent.state.inventory.utility[medkitIdx].count--;

                const isMedic = this.agent.role === 'MEDIC';
                const healingAmount = isMedic ? patient.state.maxHp : patient.state.maxHp * 0.6;
                
                patient.state.hp = Math.min(patient.state.maxHp, patient.state.hp + healingAmount);
                patient.state.modifyStress(isMedic ? -50 : -25);
                patient.state.fatigue = Math.max(0, patient.state.fatigue - (isMedic ? 20 : 10));

                if (isMedic) {
                    this.agent.addBark("YOU'RE GOOD!");
                    patient.addBark("THANKS DOC!");
                } else {
                    this.agent.addBark("PATCHING YOU UP!");
                    patient.addBark("THANKS!");
                }
                
                this.agent.memory.modifyTrust(patient.id, 0.4);
                patient.memory.modifyTrust(this.agent.id, 0.4);
                
                this.agent.memory.distressSignals.delete(patient.id);
            } else {
                this.agent.addBark("I'M OUT!");
                this.agent.memory.distressSignals.delete(patient.id);
            }
        } else if (patient) {
            const speedMod = action.movementMode === 'BOUNDING' ? Config.AGENT.RUN_SPEED_MULTIPLIER : 1.0;
            this.agent.moveTo(patient.pos, dt, world, turnSpeed, speedMod);
        }
    }

    executeResupply(action, dt, world, turnSpeed) {
        if (action.targetId === undefined) return;
        
        const source = world.agents.find(a => a.id === action.targetId);
        if (source && Utils.distance(this.agent.pos, source.pos) < 30) {
            const now = Date.now();
            if (now - this.lastResupplyTime < 1000) return;
            const myWeapon = this.agent.state.inventory.weapon;
            const sourceWeapon = source.state.inventory.weapon;
            
            const transferAmount = myWeapon.maxAmmo * 2;
            if (sourceWeapon.name === myWeapon.name && sourceWeapon.carriedAmmo > 0) {
                this.lastResupplyTime = now;
                const actualTransfer = Math.min(sourceWeapon.carriedAmmo, transferAmount);
                sourceWeapon.carriedAmmo -= actualTransfer;
                myWeapon.carriedAmmo += actualTransfer;

                this.agent.memory.modifyTrust(source.id, 0.05);
            }
        }
    }

    executeAttack(action, dt, world, turnSpeed, canSnap) {
        let finalTargetPos = null;
        if (action.targetId !== undefined) {
            const target = world.agents.find(a => a.id === action.targetId && a.team !== this.agent.team);
            const isVisible = target
                && this.agent.sensory.scan(world).includes(target)
                && world.hasVisualLine(this.agent.pos, target.pos, this.agent.traits.visionRadius);
            finalTargetPos = isVisible ? target.pos : null;
        } else if (action.target) {
            const visibleTarget = this.agent.sensory.scan(world).find(target =>
                target.team !== this.agent.team &&
                Utils.distance(target.pos, action.target) < 60 &&
                world.hasVisualLine(this.agent.pos, target.pos, this.agent.traits.visionRadius)
            );
            finalTargetPos = visibleTarget?.pos || null;
        }

        if (!finalTargetPos) {
            const movementObjective = action.moveTarget
                || (action.movementMode === 'BOUNDING' ? action.target : null);
            if (movementObjective && !this.agent.state.isPinned) {
                this.agent.moveTo(movementObjective, dt, world, turnSpeed, action.speedMultiplier || 1.0);
            }
            return;
        }

        if (finalTargetPos) {
            if (action.movementMode) this.agent.movementMode = action.movementMode;
            const speedMultiplier = Number.isFinite(action.speedMultiplier) ? action.speedMultiplier : 1.0;
            const dist = Utils.distance(this.agent.pos, finalTargetPos);
            const hasLOS = world.hasVisualLine(this.agent.pos, finalTargetPos);
            const hasClearShot = world.hasClearShot(this.agent.pos, finalTargetPos);
            const inRange = dist <= this.agent.state.inventory.weapon.range;

            // Target Tracking
            const targetAngle = Utils.angle(this.agent.pos, finalTargetPos);
            this.agent.rotateTowards(targetAngle, dt, turnSpeed, canSnap); 

            // Engagement Logic
            if (hasClearShot && inRange) {
                // We have a shot, take it!
                // If we are moving, stop to improve accuracy (unless Bounding)
                if (action.movementMode === 'TACTICAL' && this.agent.isMoving) {
                     this.agent.isMoving = false; // Halt
                }
                this.agent.shootAt(finalTargetPos, world);
            }
            
            // Movement Logic
            // Priority:
            // 1. If explicit moveTarget (e.g. Flank/Peek), go there.
            // 2. If no shot but has LOS, peek/adjust slightly.
            // 3. If no LOS, move to regain it tactilely.

            if (action.moveTarget) {
                this.agent.moveTo(action.moveTarget, dt, world, turnSpeed, speedMultiplier, finalTargetPos);
            } else if (!hasLOS) {
                 // Hunt: Move towards target but use cover if possible
                 // We rely on Decision to give us a moveTarget if flanking is needed.
                 // Otherwise, reckless advance
                 this.agent.moveTo(finalTargetPos, dt, world, turnSpeed, speedMultiplier);
            } else if (hasLOS && !hasClearShot) {
                 // We see them but something is blocking our gun (e.g. low cover or corner)
                 // Shift slightly perpendicular to target line
                 if (!this.agent.state.isPinned) {
                     const rightAngle = targetAngle + Math.PI/2;
                     const shiftX = this.agent.pos.x + Math.cos(rightAngle) * 20;
                     const shiftY = this.agent.pos.y + Math.sin(rightAngle) * 20;
                     if (world.isPositionClear(shiftX, shiftY, this.agent.radius)) {
                         this.agent.moveTo({x: shiftX, y: shiftY}, dt, world, turnSpeed, speedMultiplier, finalTargetPos);
                     }
                 }
            } else {
                 // We have clear shot. Hold position to maintain accuracy? 
                 // Unless we are too far
                 if (dist > 300 && action.movementMode === 'BOUNDING') {
                      this.agent.moveTo(finalTargetPos, dt, world, turnSpeed, speedMultiplier, finalTargetPos);
                 }
            }
        }
    }

    executeSuppress(action, dt, world, turnSpeed, canSnap) {
        if (!action.target) return;

        const now = Date.now();
        const weapon = this.agent.state.inventory.weapon;
        const control = this.suppressionFireControl;
        const key = action.areaKey || `area:${Math.round(action.target.x / 40)}:${Math.round(action.target.y / 40)}`;
        const evidenceTimestamp = action.evidenceTimestamp || 0;
        const refreshed = control.key !== key || evidenceTimestamp > control.evidenceTimestamp + 800;

        if (refreshed) {
            Object.assign(control, {
                key,
                evidenceTimestamp,
                burstsFired: 0,
                roundsRemaining: 0,
                nextBurstAt: 0,
                aimPoint: null,
                announced: false
            });
        } else {
            control.evidenceTimestamp = Math.max(control.evidenceTimestamp, evidenceTimestamp);
        }

        this.agent.movementMode = action.movementMode || 'COVERING';
        const dist = Utils.distance(this.agent.pos, action.target);
        const inRange = dist <= weapon.range;
        const hasClearShot = inRange && world.hasClearShot(this.agent.pos, action.target, weapon.range);
        const targetAngle = Utils.angle(this.agent.pos, action.target);

        if (!inRange) {
            if (!this.agent.state.isPinned) {
                this.agent.moveTo(action.target, dt, world, turnSpeed, 1.0, action.target);
            }
            return;
        }

        if (!hasClearShot) {
            this.agent.rotateTowards(targetAngle, dt, turnSpeed, canSnap);
            if (!this.agent.state.isPinned) {
                const peekSide = this.agent.id % 2 === 0 ? 1 : -1;
                const peekAngle = targetAngle + peekSide * Math.PI / 2;
                const peek = {
                    x: this.agent.pos.x + Math.cos(peekAngle) * 32,
                    y: this.agent.pos.y + Math.sin(peekAngle) * 32
                };
                if (world.isPositionClear(peek.x, peek.y, this.agent.radius)) {
                    this.agent.moveTo(peek, dt, world, turnSpeed, 0.8, action.target);
                }
            }
            return;
        }

        this.agent.isMoving = false;
        const maxBursts = Math.max(1, action.maxBursts || 1);
        if (control.roundsRemaining <= 0) {
            this.agent.rotateTowards(targetAngle, dt, turnSpeed, canSnap);
            if (control.burstsFired >= maxBursts || now < control.nextBurstAt) return;
            if (Math.abs(Utils.angleDiff(this.agent.angle, targetAngle)) > 0.18) return;

            if (weapon.type === 'LMG') control.roundsRemaining = 5 + Math.floor(Math.random() * 4);
            else if (weapon.type === 'Rifle') control.roundsRemaining = 2 + Math.floor(Math.random() * 3);
            else if (weapon.type === 'Pistol') control.roundsRemaining = 2;
            else control.roundsRemaining = 1;

            const sweepRadius = Math.max(0, action.sweepRadius || 0);
            const sweepAngle = Math.random() * Math.PI * 2;
            const sweepDistance = Math.sqrt(Math.random()) * sweepRadius;
            const sweptTarget = {
                x: Utils.clamp(action.target.x + Math.cos(sweepAngle) * sweepDistance, 0, world.width),
                y: Utils.clamp(action.target.y + Math.sin(sweepAngle) * sweepDistance, 0, world.height)
            };
            control.aimPoint = Utils.distance(this.agent.pos, sweptTarget) <= weapon.range
                && world.hasClearShot(this.agent.pos, sweptTarget, weapon.range)
                ? sweptTarget
                : action.target;

            if (!control.announced) {
                control.announced = true;
                if (control.lastAnnouncementKey !== key || now - control.lastAnnouncementAt > 6000) {
                    control.lastAnnouncementKey = key;
                    control.lastAnnouncementAt = now;
                    this.agent.addBark(action.callout || 'SUPPRESSING!');
                    world.events.emit('areaFire', {
                        agent: this.agent,
                        target: action.target,
                        reason: action.reason,
                        description: action.description || 'suppressing suspected sector',
                        confidence: action.confidence || 0
                    });
                }
            }
        }

        const aimPoint = control.aimPoint || action.target;
        const aimAngle = Utils.angle(this.agent.pos, aimPoint);
        this.agent.rotateTowards(aimAngle, dt, turnSpeed, canSnap);
        if (Math.abs(Utils.angleDiff(this.agent.angle, aimAngle)) > 0.22) return;
        if (!world.hasClearShot(this.agent.pos, aimPoint, weapon.range)) return;

        const fired = this.agent.shootAt(aimPoint, world, action.spreadMultiplier || 2.5);
        if (!fired) return;

        control.roundsRemaining--;
        if (control.roundsRemaining <= 0) {
            control.burstsFired++;
            control.nextBurstAt = now + (weapon.type === 'LMG' ? 750 : 850) + Math.random() * 450;
            control.aimPoint = null;
        }
    }

    executeRetreat(action, dt, world, turnSpeed) {
         const visibleHostiles = this.agent.sensory.scan(world).filter(a => a.team !== this.agent.team);
         let retreatLookTarget = null;
         
         const alliesFighting = world.agents.some(a => 
            a.team === this.agent.team && a !== this.agent && a.currentAction && 
            (a.currentAction.type === 'ATTACK' || a.currentAction.type === 'SUPPRESS') &&
            Utils.distance(this.agent.pos, a.pos) < 150
         );
         if (alliesFighting) {
            world.agents.forEach(a => {
                if (a.team === this.agent.team && a !== this.agent && Utils.distance(this.agent.pos, a.pos) < 200 && a.memory) {
                    a.memory.modifyTrust(this.agent.id, -0.05);
                }
            });
         }

         // RETREAT MODES: Panic vs Tactical
         const isPanicking = this.agent.state.stress > 90;
         const hasAdrenaline = this.agent.state.adrenaline > 50;
         
         if (isPanicking) {
             // Mode: PANIC - Head down, no fire, maximum sprint
             retreatLookTarget = null;
             turnSpeed = 6.0; // Fast rotation for fleeing
             if (Math.random() < 0.05) this.agent.addBark(["RUN!", "OUTTA HERE!", "AAAGH!"][Math.floor(Math.random()*3)]);
         } else if (visibleHostiles.length > 0) {
             // Mode: TACTICAL - Providing cover fire while falling back
             visibleHostiles.sort((a, b) => Utils.distance(this.agent.pos, a.pos) - Utils.distance(this.agent.pos, b.pos));
             retreatLookTarget = visibleHostiles[0].pos;
             
             // Providing cover fire
             this.agent.shootAt(retreatLookTarget, world, 3.0);
             turnSpeed = 4.0; 
             if (Math.random() < 0.01) this.agent.addBark("FALLING BACK!");
         }

         if (action.target) {
             this.agent.retreatTarget = action.target;
         } else if (!this.agent.retreatTarget) {
            const avgEnemy = this.agent.sensory.getAverageEnemyPos(world);
            if (avgEnemy) {
                const runAngle = Utils.angle(avgEnemy, this.agent.pos);
                const dist = 150;
                const target = {
                    x: Utils.clamp(this.agent.pos.x + Math.cos(runAngle) * dist, 20, world.width - 20),
                    y: Utils.clamp(this.agent.pos.y + Math.sin(runAngle) * dist, 20, world.height - 20)
                };
                this.agent.retreatTarget = target;
            } else {
                this.agent.retreatTarget = this.agent.getSquadCenter(world);
            }
         }

         if (this.agent.retreatTarget) {
            const distToTarget = Utils.distance(this.agent.pos, this.agent.retreatTarget);
            
            // ADRENALINE NUANCE: Boost speed when adrenaline is high
            const adrenalineMult = 1.0 + (this.agent.state.adrenaline / 100);
            const speedMultiplier = Config.AGENT.RUN_SPEED_MULTIPLIER * adrenalineMult;

            // ZIG-ZAG NUANCE: Run diagonally/zig-zag when retreating in the open
            const inOpen = !this.agent.brain.isSafe(world);
            this.agent.moveTo(this.agent.retreatTarget, dt, world, turnSpeed, speedMultiplier, retreatLookTarget, inOpen);
            
            if (distToTarget < 20) { 
                const threat = this.agent.sensory.getAverageEnemyPos(world);
                if (threat) this.agent.rotateTowards(Utils.angle(this.agent.pos, threat), dt, turnSpeed, true);
                this.agent.retreatTarget = null;
                this.agent.path = [];

                // If we had a chained action (like after throwing smoke), check if we should continue
                if (action.nextAction) {
                    this.agent.currentAction = action.nextAction;
                }
            }
         }
    }

    executeMutiny(action, dt, world, turnSpeed) {
        const leader = world.agents.find(a => a.team === this.agent.team && a.rank === 1);
        if (leader) {
            const angleToLeader = Utils.angle(this.agent.pos, leader.pos);
            this.agent.rotateTowards(angleToLeader, dt, turnSpeed * 2);

            if (Math.random() < 0.05) { 
                this.agent.addBark("I'M TAKING OVER!");
                
                const challengeScore = this.agent.traits.leadershipPotential * 1.2;
                const defenseScore = leader.traits.leadershipPotential * (leader.state.morale / 100); 
                
                if (challengeScore > defenseScore) {
                    leader.rank = 0;
                    leader.addBark("Fine, lead us!");
                    leader.memory.leaderApproval = 50; 
                    
                    this.agent.rank = 1;
                    this.agent.addBark("FOLLOW ME!");
                    this.agent.memory.leaderApproval = 100; 
                    
                    world.agents.forEach(a => {
                        if (a.team === this.agent.team && a !== this.agent && a !== leader) {
                            a.state.modifyMorale(20);
                            a.addBark("YES SIR!");
                        }
                    });
                } else {
                    this.agent.addBark("Sorry sir...");
                    this.agent.memory.leaderApproval = 10; 
                    this.agent.state.modifyStress(30); 
                }
                this.agent.brain.currentFocus = 'IDLE'; 
            }
        }
    }
}
