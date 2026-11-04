import { Traits } from './Traits.js?v=field-console-14';
import { State } from './State.js?v=field-console-14';
import { Memory } from './Memory.js?v=field-console-14';
import { Sensory } from './Sensory.js?v=field-console-14';
import { Brain } from './brain/Brain.js?v=field-console-14';
import { Utils } from './Utils.js?v=field-console-14';
import { Projectile } from './Projectile.js?v=field-console-14';
import { Config } from './Config.js?v=field-console-14';
import { Motor } from './Motor.js?v=field-console-14';
import { ActionExecutor } from './ActionExecutor.js?v=field-console-14';
import { WeaponSystem } from './WeaponSystem.js?v=field-console-14';

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
        this.distanceMoved = 0;
        this.isReacting = false;
        this.lastReactionTime = 0;
        this.isMoving = false;
        this.lastSuppressionReaction = 0;
        this.movementMode = 'TACTICAL';
        
        const now = Date.now();
        this.nextScanTime = now + Math.random() * 200;
        this.nextStateUpdateTime = now + Math.random() * 100;
        this.lastStateUpdateTime = now;
        this.nextCohesionTime = now + Math.random() * 500;

        this.barks = []; // { text, life, id }
        this.barkIdCounter = 0;
    }

    addBark(text) {
        if (this.barks.some(b => b.text === text && b.life > 500)) return;
        this.barks.push({ text, life: 2000, id: this.barkIdCounter++ });
    }

    initTacticalIntel(world) {
        this.memory.socialCredit = new Map();
        world.agents.forEach(a => {
            if (a.team === this.team) {
                if (a !== this) this.memory.socialCredit.set(a.id, 0.7); 
                
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

    update(dt, world) {
        const now = Date.now();
        this.weaponSystem.update(now);

        if (this.isPlayer) {
            if (now >= this.nextStateUpdateTime) {
                const stateDt = now - (this.lastStateUpdateTime || (now - 100));
                this.lastStateUpdateTime = now;
                this.state.update(stateDt, 0, this._isMovingLastCycle);
                this.nextStateUpdateTime = now + 100;
                this._isMovingLastCycle = false;
            }
            if (this.isMoving) this._isMovingLastCycle = true;

            if (this.state.isDead) return;

            this.barks.forEach(bark => bark.life -= dt);
            this.barks = this.barks.filter(bark => bark.life > 0);

            if (now >= this.nextScanTime) {
                this.sensory.scan(world, now - (this.lastScanTime || (now - 200)));
                this.lastScanTime = now;
                this.nextScanTime = now + 200;
            }
            this.memory.cleanup(world, dt);
            return;
        }

        this.brain.update(dt, world);

        if (now >= this.nextStateUpdateTime) {
            const stateDt = now - (this.lastStateUpdateTime || (now - 100));
            this.lastStateUpdateTime = now;
            
            let stressBaseline = this.traits.neuroticism * 10 + this.memory.traumaLevel;
            this.state.update(stateDt, stressBaseline, this._isMovingLastCycle);
            this.nextStateUpdateTime = now + 100;
            this._isMovingLastCycle = false;
        }

        if (this.isMoving) this._isMovingLastCycle = true;
        this.isMoving = false;
        
        if (this.state.isDead) return;

        this.memory.traumaLevel = Math.max(0, this.memory.traumaLevel - (dt * 0.0005)); 
        
        this.barks.forEach(b => b.life -= dt);
        this.barks = this.barks.filter(b => b.life > 0);
        
        if (now >= this.nextScanTime) {
            this.sensory.scan(world, now - (this.lastScanTime || (now - 200)));
            this.lastScanTime = now;
            this.nextScanTime = now + 200;
        }
        
        this.memory.cleanup(world, dt);

        const action = this.brain.decide(world);
        if (this.currentAction && this.currentAction.type !== action.type) {
            this.retreatTarget = null;
            this.patrolTarget = null;
        }
        this.currentAction = action;

        this.communicate(world);

        this.executeAction(action, dt, world);

        this.applyJitter(dt);
        
        this.handleFootsteps(dt, world);
    }

    handleFootsteps(dt, world) {
        if (this.isMoving) {
            const currentSpeed = this.calculateCurrentSpeed(world);
            const dist = currentSpeed * (dt / 1000);
            this.distanceMoved += dist;

            const stepInterval = 60;
            if (this.distanceMoved > stepInterval) {
                this.distanceMoved = 0;
                
                let soundRadius = 0;
                let soundType = 'STEP';

                if (this.state.inBush) {
                    soundRadius = 300;
                    soundType = 'RUSTLE';
                } else {
                    switch (this.movementMode) {
                        case 'BOUNDING': soundRadius = 500; break;
                        case 'TACTICAL': soundRadius = 250; break;
                        case 'SNEAKING': soundRadius = 0; break;
                        case 'COVERING': soundRadius = 0; break;
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
        
        const freezeChance = Config.AGENT.FROZEN_PROB_PER_HIT + (this.traits.neuroticism * 0.25);
        if (amount > 1 && Math.random() < freezeChance) {
            this.state.isFrozenUntil = Date.now() + 1000 + (Math.random() * 2000 * (1 + this.traits.neuroticism));
            this.addBark("AAAGH!");
        }

        if (this.state.hp <= 0 && !this.state.isDead) {
             this.state.isDead = true;
             this.state.modifyMorale(-30);

             if (world) {
                 world.radioNet[this.team].push({
                     type: 'DISTRESS',
                     distressType: 'MAN_DOWN',
                     sourceId: this.id,
                     x: this.pos.x,
                     y: this.pos.y,
                     timestamp: Date.now(),
                     broadcasted: false
                 });

                 if (sourceId !== null && sourceId !== undefined) {
                     const killer = world.agents.find(a => a.id === sourceId);
                     if (killer && killer.team !== this.team) {
                         killer.state.onKill();
                         killer.addBark(["GOT ONE!", "TANGO DOWN!", "SCRATCH ONE!"][Math.floor(Math.random()*3)]);
                     }
                 }

                  const witnesses = world.spatial.query(this.pos.x, this.pos.y, Config.AGENT.VISION_RADIUS);
                  
                  witnesses.forEach(w => {
                      if (w.isCover || w.id === this.id) return;
                      const dist = Utils.distance(this.pos, w.pos);
                      const canSee = world.hasVisualLine(this.pos, w.pos, Config.AGENT.VISION_RADIUS);
                      
                      if (canSee) {
                        if (w.team === this.team) {
                            const isFriend = (w.memory.socialCredit.get(this.id) || 0) > 0.6;
                            w.state.onAllyDeath(isFriend);
                            w.memory.updateHazard(this.pos.x, this.pos.y, world, 80);
                            
                            if (isFriend) w.addBark("NOOO!");
                            else if (Math.random() < 0.3) w.addBark("MAN DOWN!");
                            
                            w.react(world);
                        } else {
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
            
            if (this.currentAction && this.currentAction.type === 'IDLE') {
                this.idleLookTimer = 0;
                this.targetAngle += Math.PI + (Math.random() - 0.5) * 2; 
            }
        }
    }

    suppress(amount, world = null, sourcePos = null) {

        
        if (sourcePos) {
            const angle = Utils.angle(this.pos, sourcePos);
            const now = Date.now();
            
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

        const mult = 1.0 + (this.traits.neuroticism * 1.5);
        const oldSuppression = this.state.suppression;
        this.state.suppression = Math.min(100, this.state.suppression + amount * mult);
        this.state.modifyStress(amount * 0.15 * mult);

        const panicFreezeChance = 0.01 + (this.traits.neuroticism * 0.08); 
        if (this.state.stress > Config.AGENT.FROZEN_STRESS_THRESHOLD && Math.random() < panicFreezeChance) {
             this.state.isFrozenUntil = Date.now() + 1500 + (this.traits.neuroticism * 2000);
             this.addBark("...!");
        }
        
        const crossedThreshold = oldSuppression < 50 && this.state.suppression >= 50;
        const significantJump = (this.state.suppression - this.lastSuppressionReaction) > 20;

        if (world && (crossedThreshold || significantJump)) {
            this.lastSuppressionReaction = this.state.suppression;
            this.react(world);
        }
    }

    rotateTowards(angle, dt, turnRate = Config.AGENT.TURN_SPEED, snap = false) {
        this.motor.rotateTowards(angle, dt, turnRate, snap);
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
        
        const now = Date.now();
        if (!force && (now - this.lastReactionTime < 200)) return;
        
        this.isReacting = true;
        this.lastReactionTime = now;

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
        const cooldown = 8000 - (this.traits.extraversion * 6000);
        
        if (now - this.lastShoutTime < cooldown) return;

        const seesEnemy = this.sensory.scan(world).some(a => a.team !== this.team); 
        const isStressed = this.state.stress > 50;
        const isPinned = this.state.isPinned;
        const isWounded = this.state.hp < this.state.maxHp * 0.3;
        
        if (seesEnemy || isStressed || isPinned || isWounded) {
            this.lastShoutTime = now;
            const voiceRadius = Config.PHYSICS.SOUND_RADIUS_SHOUT;
            
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
                if (this.brain.isSafe(world)) {
                    distressType = 'PINNED';
                    this.addBark("UNDER FIRE!");
                } else {
                    distressType = 'NEED_COVER';
                    this.addBark("COVER ME!");
                }
            }

            const potentialAllies = world.spatial.query(this.pos.x, this.pos.y, voiceRadius);
            const allies = potentialAllies.filter(a => 
                !a.isCover &&
                a.team === this.team && 
                a.id !== this.id && 
                Utils.distance(this.pos, a.pos) < voiceRadius
            );

            const self = this;
            this.showShoutUntil = Date.now() + 500;

            let calloutPos = null;
            const enemy = this.brain.cortex.getThreatSource(world, false);
            
            if (enemy && enemy.pos) {
                 const stressFactor = this.state.stress / 100;
                 const noise = 50 + (stressFactor * 150);
                 
                 calloutPos = {
                     x: enemy.pos.x + (Math.random() - 0.5) * noise,
                     y: enemy.pos.y + (Math.random() - 0.5) * noise
                 };
            }

            const soundType = distressType === 'MEDIC' ? 'MEDIC_CALL' : 'SHOUT';
            
            world.addSoundEvent(this.pos.x, this.pos.y, voiceRadius, soundType, this.id, this.team, calloutPos, distressType);

            const radioCooldown = Config.SENSORY.RADIO.COOLDOWN;
            const canRadio = now - (this.lastRadioTime || 0) > radioCooldown;

            if (canRadio) {
                if (this.rank === 1 && enemy && enemy.pos) {
                    this.lastRadioTime = now;
                    const rNoise = Config.SENSORY.RADIO.NOISE;
                    const reportX = enemy.pos.x + (Math.random() - 0.5) * rNoise;
                    const reportY = enemy.pos.y + (Math.sin(now) * rNoise);
                    
                    world.radioNet[this.team].push({
                        type: 'HEAT',
                        x: reportX,
                        y: reportY,
                        timestamp: now,
                        intensity: Config.SENSORY.RADIO.INTEL_INTENSITY,
                        broadcasted: false
                    });
                }
                
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
        const buffer = 30;
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
