import { Traits } from './Traits.js';
import { State } from './State.js';
import { Memory } from './Memory.js';
import { Sensory } from './Sensory.js';
import { Brain } from './brain/Brain.js';
import { Utils } from './Utils.js';
import { Projectile } from './Projectile.js';
import { Config } from './Config.js';
import { Motor } from './Motor.js';
import { ActionExecutor } from './ActionExecutor.js';
import { WeaponSystem } from './WeaponSystem.js';

export class Agent {
    constructor(id, team, x, y, role = 'RIFLEMAN', world) {
        this.id = id;
        this.team = team;
        this.motor = new Motor(this);
        this.weaponSystem = new WeaponSystem(this);
        this.actionExecutor = new ActionExecutor(this);
        this.pos = { x, y };
        this.angle = Math.random() * Math.PI * 2;
        this.targetAngle = this.angle;
        this.radius = Config.AGENT.RADIUS;
        
        this.traits = new Traits();
        this.role = role;
        
        this.state = new State(this.role);
        this.memory = new Memory(world.width, world.height);
        
        this.sensory = new Sensory(this);
        this.brain = new Brain(this);

        this.currentAction = { type: 'IDLE', score: 0 };
        this.idleTargetAngle = this.angle;
        this.smoothedMoveAngle = this.angle;
        this.lastShoutTime = 0;
        this.path = [];
        this.commLinks = [];
        this.lastThoughtChange = 0;
        this.idleLookTimer = 0;
        this.cachedLookPos = null;
        
        this.retreatTarget = null;
        this.patrolTarget = null;
        this.targetPos = null;
        
        this.rank = 0; // 0: Private, 1: Captain
        this.buffs = { leader: false };
        this.lastThrowTime = 0;
        this.armingUntil = 0;
        this.armingAction = null;
        this.lastAdvanceTime = 0;
        this.lastDistressTime = 0;
        this.distanceMoved = 0; // Track distance for footstep sounds
        this.isReacting = false;
        this.lastReactionTime = 0;
        this.isMoving = false;
        this.lastSuppressionReaction = 0;
        this.movementMode = 'TACTICAL'; // BOUNDING, TACTICAL, SNEAKING, COVERING
        
        // Optimizations (Staggered to prevent frame-spikes)
        const now = Date.now();
        this.nextScanTime = now + Math.random() * 200; // Staggered start (5Hz)
        this.nextStateUpdateTime = now + Math.random() * 100; // Staggered (10Hz)
        this.lastStateUpdateTime = now;
        this.nextCohesionTime = now + Math.random() * 500;

        // Visual Barks System
        this.barks = []; // { text, life, id }
        this.barkIdCounter = 0;
    }

    addBark(text) {
        // Prevent spamming same bark
        if (this.barks.some(b => b.text === text && b.life > 500)) return;
        this.barks.push({ text, life: 2000, id: this.barkIdCounter++ });
    }

    initTacticalIntel(world) {
        this.memory.socialCredit = new Map();
        world.agents.forEach(a => {
            if (a.team === this.team) {
                // Initialize Social Trust
                if (a !== this) this.memory.socialCredit.set(a.id, 0.7); 
                
                // Initialize Control Map with teammate locations (Green Grid)
                this.memory.updateControl(a.pos.x, a.pos.y, world, 10);
            }
        });
    }

    getSquadCenter(world) {
        let x = 0, y = 0, count = 0;
        world.agents.forEach(a => {
            if (a.team === this.team) {
                x += a.pos.x;
                y += a.pos.y;
                count++;
            }
        });
        if (count === 0) return this.pos;
        return { x: x/count, y: y/count };
    }

    getAverageEnemyPos(world) {
        return this.sensory.getAverageEnemyPos(world);
    }

    rotateTowards(angle, dt, speedMult = 1.0, snap = false) {
        this.motor.rotateTowards(angle, dt, speedMult, snap);
    }





    update(dt, world) {
        const now = Date.now();

        // --- PLAYER AGENT: Skip AI brain entirely ---
        if (this.isPlayer) {
            // State update (HP regen and stamina recovery only — no psychology)
            if (now >= this.nextStateUpdateTime) {
                const stateDt = now - (this.lastStateUpdateTime || (now - 100));
                this.lastStateUpdateTime = now;
                this.state.update(stateDt, 0, this._isMovingLastCycle);
                // Force-neutralize all psychology debuffs
                this.state.stress = 0;
                this.state.morale = 100;
                this.state.suppression = 0;
                this.state.isPinned = false;
                this.state.isFrozenUntil = 0;
                this.nextStateUpdateTime = now + 100;
                this._isMovingLastCycle = false;
            }
            if (this.isMoving) this._isMovingLastCycle = true;

            if (this.state.isDead) return;
            this.memory.traumaLevel = 0;

            // Sensory scan (so FOW knows what player sees)
            if (now >= this.nextScanTime) {
                this.sensory.scan(world, now - (this.lastScanTime || (now - 200)));
                this.lastScanTime = now;
                this.nextScanTime = now + 200;
            }
            this.memory.cleanup(world, dt);
            // PlayerInput.applyToAgent handles movement, shooting, pickup
            return;
        }

        // --- AI AGENT: Original logic ---
        // 1. Update Brain (State, Emotions, Social)
        this.brain.update(dt, world);

        // 2. Physics & State Update (Throttled for performance and realism)
        if (now >= this.nextStateUpdateTime) {
            const stateDt = now - (this.lastStateUpdateTime || (now - 100));
            this.lastStateUpdateTime = now;
            
            let stressBaseline = this.traits.neuroticism * 10 + this.memory.traumaLevel;
            this.state.update(stateDt, stressBaseline, this._isMovingLastCycle);
            this.nextStateUpdateTime = now + 100; // 10Hz passive recovery
            this._isMovingLastCycle = false; // Reset after processing
        }

        // Accumulate movement for the next throttled cycle
        if (this.isMoving) this._isMovingLastCycle = true;
        this.isMoving = false; // Reset per-frame flag
        
        if (this.state.isDead) return;

        this.memory.traumaLevel = Math.max(0, this.memory.traumaLevel - (dt * 0.0005)); 
        
        // 3. Update Barks (Visuals)
        this.barks.forEach(b => b.life -= dt);
        this.barks = this.barks.filter(b => b.life > 0);
        
        // 4. Sense (Throttled 5Hz for vision)
        if (now >= this.nextScanTime) {
            this.sensory.scan(world, now - (this.lastScanTime || (now - 200)));
            this.lastScanTime = now;
            this.nextScanTime = now + 200; // 5Hz is plenty for vision updates
        }
        
        this.memory.cleanup(world, dt);

        // 5. Think
        const action = this.brain.decide(world);
        if (this.currentAction && this.currentAction.type !== action.type) {
            this.retreatTarget = null;
            this.patrolTarget = null;
        }
        this.currentAction = action;

        // 6. Communicate
        this.communicate(world);

        // 7. Act
        this.executeAction(action, dt, world);

        // 8. Post-Action: Apply systematic jitter
        this.applyJitter(dt);
        
        // 9. Acoustic Stealth: Footstep Sounds
        this.handleFootsteps(dt, world);
    }

    handleFootsteps(dt, world) {
        if (this.isMoving) {
            const currentSpeed = this.calculateCurrentSpeed(world);
            const dist = currentSpeed * (dt / 1000);
            this.distanceMoved += dist;

            const stepInterval = 60; // Sound every 60px (~3 steps)
            if (this.distanceMoved > stepInterval) {
                this.distanceMoved = 0;
                
                let soundRadius = 0;
                let soundType = 'STEP';

                // Bush movement is always noisy (rustling)
                if (this.state.inBush) {
                    soundRadius = 300; // Loud rustle
                    soundType = 'RUSTLE';
                } else {
                    // Open ground movement
                    switch (this.movementMode) {
                        case 'BOUNDING': soundRadius = 500; break; // Sprinting is loud
                        case 'TACTICAL': soundRadius = 250; break;  // Jogging is audible
                        case 'SNEAKING': soundRadius = 0; break;   // Silent
                        case 'COVERING': soundRadius = 0; break;   // Silent
                    }
                }

                if (soundRadius > 0) {
                    world.addSoundEvent(this.pos.x, this.pos.y, soundRadius, soundType, this.id, this.team);
                }
            }
        }
    }

    takeDamage(amount, world = null, sourceId = null) {
        this.state.takeDamage(amount);
        if (world && world.audio) world.audio.playHit();
        
        // CHANCE TO FREEZE (Shock)
        // High Neuroticism = Higher chance to freeze on hit
        const freezeChance = Config.AGENT.FROZEN_PROB_PER_HIT + (this.traits.neuroticism * 0.25);
        if (amount > 1 && Math.random() < freezeChance) {
            this.state.isFrozenUntil = Date.now() + 1000 + (Math.random() * 2000 * (1 + this.traits.neuroticism));
            this.addBark("AAAGH!");
        }

        if (this.state.hp <= 0 && !this.state.isDead) {
             this.state.isDead = true;
             this.state.modifyMorale(-30);

             // DEATH EVENTS
             if (world) {
                 // 0. RADIO BROADCAST: "MAN DOWN!"
                 world.radioNet[this.team].push({
                     type: 'DISTRESS',
                     distressType: 'MAN_DOWN',
                     sourceId: this.id,
                     x: this.pos.x,
                     y: this.pos.y,
                     timestamp: Date.now(),
                     broadcasted: false
                 });

                 // 1. Reward Killer
                 if (sourceId) {
                     const killer = world.agents.find(a => a.id === sourceId);
                     if (killer && killer.team !== this.team) {
                         killer.state.onKill();
                         killer.addBark(["GOT ONE!", "TANGO DOWN!", "SCRATCH ONE!"][Math.floor(Math.random()*3)]);
                     }
                 }

                  // 2. Notify Witnesses (Friend/Foe)
                  const witnesses = world.spatial.query(this.pos.x, this.pos.y, Config.AGENT.VISION_RADIUS);
                  
                  witnesses.forEach(w => {
                      if (w.isCover || w.id === this.id) return;
                      const dist = Utils.distance(this.pos, w.pos);
                      const canSee = world.hasLineOfSight(this.pos, w.pos, Config.AGENT.VISION_RADIUS, false); 
                      
                      if (canSee) {
                        if (w.team === this.team) {
                            // Ally Died
                            const isFriend = (w.memory.socialCredit.get(this.id) || 0) > 0.6;
                            w.state.onAllyDeath(isFriend);
                            w.memory.updateHazard(this.pos.x, this.pos.y, world, 80); // Mark fatal funnel
                            
                            if (isFriend) w.addBark("NOOO!");
                            else if (Math.random() < 0.3) w.addBark("MAN DOWN!");
                            
                            w.react(world); // Immediate re-evaluation
                        } else {
                            // Enemy Died
                            w.state.onWitnessKill();
                            if (Math.random() < 0.2) w.addBark("NICE SHOT!");
                            w.react(world);
                        }
                     }
                  });
             }
        }
        if (world) {
            this.react(world);
            
            // If we are IDLE, force a rotation reset to try and spot the shooter
            if (this.currentAction && this.currentAction.type === 'IDLE') {
                this.idleLookTimer = 0; // Trigger immediate turn
                this.targetAngle += Math.PI + (Math.random() - 0.5) * 2; 
            }
        }
    }

    suppress(amount, world = null, sourcePos = null) {

        
        // CROSSFIRE LOGIC
        if (sourcePos) {
            const angle = Utils.angle(this.pos, sourcePos);
            const now = Date.now();
            
            // Check if we are already suppressed from a significantly different angle
            const crossfire = this.state.suppressionSources.some(s => {
                const diff = Math.abs(Utils.angleDiff(angle, s.angle));
                return diff > Config.AGENT.CROSSFIRE_ANGLE_THRESHOLD;
            });
            
            if (crossfire) {
                amount *= Config.AGENT.CROSSFIRE_STRESS_MULTIPLIER;
                this.addBark("CROSSFIRE!");
            }
            
            this.state.suppressionSources.push({ angle, time: now });
        }

        // High neuroticism = easier to suppress
        // Reduced penalty for high N from 3.0 to 1.5
        const mult = 1.0 + (this.traits.neuroticism * 1.5);
        const oldSuppression = this.state.suppression;
        this.state.suppression = Math.min(100, this.state.suppression + amount * mult);
        this.state.modifyStress(amount * 0.15 * mult); // Reduced from 0.2 to 0.15

        // CHANCE TO FREEZE (Panic)
        const panicFreezeChance = 0.01 + (this.traits.neuroticism * 0.08); 
        if (this.state.stress > Config.AGENT.FROZEN_STRESS_THRESHOLD && Math.random() < panicFreezeChance) {
             this.state.isFrozenUntil = Date.now() + 1500 + (this.traits.neuroticism * 2000);
             this.addBark("...!");
        }
        
        // Only trigger reaction if we crossed a significant threshold or suppression jumped significantly
        const crossedThreshold = oldSuppression < 50 && this.state.suppression >= 50;
        const significantJump = (this.state.suppression - this.lastSuppressionReaction) > 20;

        if (world && (crossedThreshold || significantJump)) {
            this.lastSuppressionReaction = this.state.suppression;
            this.react(world);
        }
    }

    rotateTowards(angle, dt, speedMult = 1.0, snap = false) {
        this.motor.rotateTowards(angle, dt, speedMult, snap);
    }

    applyJitter(dt) {
        if (this.state.stress > Config.AGENT.JITTER_THRESHOLD) {
            const intensity = (this.state.stress - Config.AGENT.JITTER_THRESHOLD) / 30;
            if (Math.random() < 0.1 * intensity) {
                this.targetAngle += (Math.random() - 0.5) * 0.2 * intensity;
            }
        }
    }

    react(world, force = false) {
        if (this.isReacting) return;
        
        // Throttling: Only react at most once every 200ms to prevent decision-storm lag
        // UNLESS forced (e.g. immediate gunshot reaction)
        const now = Date.now();
        if (!force && (now - this.lastReactionTime < 200)) return;
        
        this.isReacting = true;
        this.lastReactionTime = now;

        // Force re-think bypassing inertia
        const action = this.brain.decide(world, true);
        if (this.currentAction && this.currentAction.type !== action.type) {
            this.retreatTarget = null;
            this.patrolTarget = null;
        }
        this.currentAction = action;

        this.isReacting = false;
    }

    communicate(world) {
        const now = Date.now();
        // EXTRAVERSION: Vocal Frequency
        // High E (1.0) = ~2s cooldown. Low E (0.0) = ~8s cooldown.
        const cooldown = 8000 - (this.traits.extraversion * 6000);
        
        if (now - this.lastShoutTime < cooldown) return;

        const seesEnemy = this.sensory.scan(world).some(a => a.team !== this.team); 
        const isStressed = this.state.stress > 50;
        const isPinned = this.state.isPinned;
        const isWounded = this.state.hp < this.state.maxHp * 0.3;
        
        if (seesEnemy || isStressed || isPinned || isWounded) {
            this.lastShoutTime = now;
            const voiceRadius = Config.PHYSICS.SOUND_RADIUS_SHOUT;
            
            // Determine distress type
            let distressType = null;
            if (isWounded) {
                const hasMedkit = this.state.inventory.utility.some(u => u.type === 'Medkit' && u.count > 0);
                const nearbyMedkit = world.loot.some(l => l.type === 'Medkit' && Utils.distance(this.pos, l) < 50);
                
                if (!hasMedkit && !nearbyMedkit) {
                    distressType = 'MEDIC';
                    this.addBark("MEDIC!");
                } else if (hasMedkit) {
                     this.addBark("I'M HIT! PATCHING!");
                }
            } else if (isPinned) {
                // If I am already in cover, communicate support need, not cover need
                if (this.brain.isSafe(world)) {
                    distressType = 'PINNED'; // Different signal? Or reuse? Let's keep signal simple for now or change bark.
                    this.addBark("UNDER FIRE!");
                } else {
                    distressType = 'NEED_COVER';
                    this.addBark("COVER ME!");
                }
            }

            // Use SpatialGrid to find allies to shout at
            const potentialAllies = world.spatial.query(this.pos.x, this.pos.y, voiceRadius);
            const allies = potentialAllies.filter(a => 
                !a.isCover &&
                a.team === this.team && 
                a.id !== this.id && 
                Utils.distance(this.pos, a.pos) < voiceRadius
            );

            const self = this;
            this.showShoutUntil = Date.now() + 500;

            // GENERATE SENSORY CALLOUT (Fuzzy Coordinates)
            // We no longer sync data directly. We broadcast a sound event with "rough" info.
            
            let calloutPos = null;
            const enemy = this.brain.cortex.getThreatSource(world, false); // Only report what we SEE
            
            if (enemy && enemy.pos) {
                 // Add inaccuracy based on stress (Higher stress = more shouting error)
                 const stressFactor = this.state.stress / 100;
                 const noise = 50 + (stressFactor * 150); // 50px - 200px error variance
                 
                 calloutPos = {
                     x: enemy.pos.x + (Math.random() - 0.5) * noise,
                     y: enemy.pos.y + (Math.random() - 0.5) * noise
                 };
            }

            // Global sound event (Sensory.js handles who hears it)
            // If we have a specific distress type (MEDIC!), that takes priority in the shout type
            const soundType = distressType === 'MEDIC' ? 'MEDIC_CALL' : 'SHOUT';
            
            world.addSoundEvent(this.pos.x, this.pos.y, voiceRadius, soundType, this.id, this.team, calloutPos, distressType);

            // --- RADIO NET: SQUAD LEADER BROADCAST ---
            // Leaders/Radiomen broadcast to the whole team net
            const radioCooldown = Config.SENSORY.RADIO.COOLDOWN;
            const canRadio = now - (this.lastRadioTime || 0) > radioCooldown;

            if (canRadio) {
                if (this.rank === 1 && enemy && enemy.pos) {
                    this.lastRadioTime = now;
                    // Add noise to the radio report
                    const rNoise = Config.SENSORY.RADIO.NOISE;
                    const reportX = enemy.pos.x + (Math.random() - 0.5) * rNoise;
                    const reportY = enemy.pos.y + (Math.sin(now) * rNoise); // Different noise spread
                    
                    world.radioNet[this.team].push({
                        type: 'HEAT',
                        x: reportX,
                        y: reportY,
                        timestamp: now,
                        intensity: Config.SENSORY.RADIO.INTEL_INTENSITY,
                        broadcasted: false
                    });
                }
                
                // Anyone can broadcast a distress signal over radio (Mayday!)
                if (distressType) {
                    this.lastRadioTime = now;
                    world.radioNet[this.team].push({
                        type: 'DISTRESS',
                        distressType: distressType,
                        sourceId: this.id,
                        x: this.pos.x,
                        y: this.pos.y,
                        timestamp: now,
                        broadcasted: false
                    });
                }
            }
        }
    }

    getCurrentCovers(world) {
        const covers = [];
        const buffer = 30; // Allow shooting from near-cover
        for (const c of world.covers) {
            if (this.pos.x >= c.x - buffer && this.pos.x <= c.x + c.w + buffer && 
                this.pos.y >= c.y - buffer && this.pos.y <= c.y + c.h + buffer) {
                covers.push(c);
            }
        }
        return covers;
    }

    shootAt(targetPos, world, inaccuracyMultiplier = 1.0) {
        return this.weaponSystem.shootAt(targetPos, world, inaccuracyMultiplier);
    }

    calculateCurrentSpeed(world) {
        return this.motor.calculateCurrentSpeed(world);
    }

    moveTo(targetPos, dt, world, turnSpeed = Config.AGENT.TURN_SPEED, speedMultiplier = 1.0, lookTarget = null, inOpen = false) {
        this.motor.moveTo(targetPos, dt, world, turnSpeed, speedMultiplier, lookTarget, inOpen);
    }

    executeAction(action, dt, world) {
        this.actionExecutor.execute(action, dt, world);
    }
}
