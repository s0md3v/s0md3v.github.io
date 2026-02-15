import { Traits } from './Traits.js';
import { State } from './State.js';
import { Memory } from './Memory.js';
import { Sensory } from './Sensory.js';
import { Decision } from './Decision.js';
import { Utils } from './Utils.js';
import { Projectile } from './Projectile.js';
import { Config } from './Config.js';

export class Agent {
    constructor(id, team, x, y, role = 'RIFLEMAN', world) {
        this.id = id;
        this.team = team;
        this.pos = { x, y };
        this.angle = Math.random() * Math.PI * 2;
        this.targetAngle = this.angle;
        this.radius = Config.AGENT.RADIUS;
        
        this.traits = new Traits();
        this.role = role;
        
        this.state = new State(this.role);
        this.memory = new Memory(world.width, world.height);
        
        this.sensory = new Sensory(this);
        this.brain = new Decision(this);

        this.currentAction = null;
        this.idleTargetAngle = this.angle;
        this.smoothedMoveAngle = this.angle;
        this.lastShoutTime = 0;
        this.path = [];
        this.commLinks = [];
        this.lastThoughtChange = 0;
        this.idleLookTimer = 0;
        
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
        
        // Optimizations
        this.nextScanTime = Math.random() * 100; // Staggered start
        this.nextCohesionTime = Math.random() * 500;
        this.cachedAlliesNearby = 0;

        // Visual Barks System
        this.barks = []; // { text, life, id }
        this.barkIdCounter = 0;
    }

    addBark(text) {
        // Prevent spamming same bark
        if (this.barks.some(b => b.text === text && b.life > 500)) return;
        this.barks.push({ text, life: 2000, id: this.barkIdCounter++ });
    }

    initTeammateTrust(world) {
        this.memory.socialCredit = new Map();
        // One-time init, O(N) is acceptable
        // Still can optimize via team lists if we had them
        world.agents.forEach(a => {
            if (a.team === this.team && a !== this) {
                this.memory.socialCredit.set(a.id, 0.7); 
            }
        });
    }

    getSquadCenter(world) {
        let x = 0, y = 0, count = 0;
        // Squad finding is global, spatial grid doesn't help much given we need ALL teammates
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
        const enemies = this.sensory.scan(world).filter(a => a.team !== this.team);
        if (enemies.length === 0) return null;
        let x = 0, y = 0;
        enemies.forEach(e => {
            x += e.pos.x;
            y += e.pos.y;
        });
        return { x: x/enemies.length, y: y/enemies.length };
    }

    update(dt, world) {
        const now = Date.now();

        // 1. Calculate Stress & Cohesion (Throttled 2Hz)
        if (now >= this.nextCohesionTime) {
            const cohesionRange = Config.AGENT.COHESION_RADIUS;
            this.cachedAlliesNearby = world.spatial.query(this.pos.x, this.pos.y, cohesionRange)
                .filter(a => !a.isCover && a.team === this.team && a !== this && Utils.distance(this.pos, a.pos) < cohesionRange).length;
            this.nextCohesionTime = now + 500;
        }
        const alliesNearby = this.cachedAlliesNearby;

        // Base stress goal remains low to encourage standing ground
        let stressBaseline = this.traits.neuroticism * 10; 
        stressBaseline += this.memory.traumaLevel;
        
        // Heatmap awareness (Uncertainty)
        const mem = this.memory;
        const gx = Math.floor((this.pos.x / world.width) * mem.gridCols);
        const gy = Math.floor((this.pos.y / world.height) * mem.gridRows);
        let localHeat = 0;
        if (gx >= 0 && gx < mem.gridCols && gy >= 0 && gy < mem.gridRows) {
            localHeat = mem.heatmap[gy][gx];
        }

        const visibleEnemies = this.sensory.scan(world).filter(a => a.team !== this.team && this.memory.isSpotted(a.id));
        
        // Event: Spiking stress when new enemies appear
        // Bark CONTACT if we see enemies and haven't reported contact recently (10s cooldown)
        // This prevents spam when enemies flicker in/out of vision
        if (visibleEnemies.length > 0 && (this.lastVisibleCount || 0) === 0) {
            const timeSinceReport = Date.now() - (this.lastContactReportTime || 0);
            
            if (timeSinceReport > 10000) {
                const spike = visibleEnemies.length * Config.AGENT.STRESS_SPIKE_SIGHT;
                const resistance = alliesNearby > 0 ? Config.AGENT.COHESION_STRESS_RESISTANCE : 1.0;
                this.state.modifyStress(spike * resistance);
                this.addBark("CONTACT!");
                this.lastContactReportTime = Date.now();
            }
        }
        this.lastVisibleCount = visibleEnemies.length;

        // Fog of War Tension
        if (localHeat > 4 && visibleEnemies.length === 0) {
            this.state.modifyStress(Config.AGENT.UNCERTAINTY_STRESS_RATE * dt);
        }

        // Leader Buff: High stress resistance
        if (this.buffs.leader) {
            this.state.modifyStress(Config.AGENT.LEADER_BUFF_STRESS * (dt / 1000));
            this.state.morale += (dt * 0.005);
        }

        // Stress Decay logic: Faster with squad
        const decayRate = alliesNearby > 0 ? Config.AGENT.STRESS_DECAY_COHESIVE : Config.AGENT.STRESS_DECAY_ISOLATED;
        
        // Manual decay towards baseline
        if (this.state.stress > stressBaseline) {
            this.state.stress = Math.max(stressBaseline, this.state.stress - (dt * decayRate));
        }

        this.state.update(dt, stressBaseline, this.isMoving);

        // FATIGUE FROM EXERTION: Sprinting makes you tired
        if (this.isMoving && this.movementMode === 'BOUNDING') {
            this.state.fatigue = Math.min(100, this.state.fatigue + Config.AGENT.FATIGUE_EXERTION_RATE * dt);
        }

        // Update Bush State
        this.state.inBush = false;
        const bushGx = Math.floor(this.pos.x / Config.WORLD.GRID_SIZE);
        const bushGy = Math.floor(this.pos.y / Config.WORLD.GRID_SIZE);
        if (world.grid[bushGy] && world.grid[bushGy][bushGx] === 2) {
            this.state.inBush = true;
        }

        // Update Smoke State
        const wasInSmoke = this.state.inSmoke;
        this.state.inSmoke = world.smokes.some(s => Utils.distance(this.pos, s) < s.radius);
        if (this.state.inSmoke && !wasInSmoke) {
             // Status reporting: Extraverts and Conscientious agents are more likely to report
             const reportProb = (this.traits.extraversion * 0.3) + (this.traits.conscientiousness * 0.2);
             if (Math.random() < reportProb) this.addBark("SMOKE SCREEN!");
        }

        this.isMoving = false; // Reset for next frame
        
        if (this.state.isDowned || this.state.isDead) return;

        this.memory.traumaLevel = Math.max(0, this.memory.traumaLevel - (dt * 0.0005)); 
        
        // 0. Update Barks
        this.barks.forEach(b => b.life -= dt);
        this.barks = this.barks.filter(b => b.life > 0);
        
        // 1. Perception Update checks (Grenades)
        // Check for active grenades nearby
        for (const p of world.projectiles) {
            if ((p.type === 'GRENADE' || p.type === 'SMOKE') && p.active) {
                 const dist = Utils.distance(this.pos, p.pos);
                 const dangerRadius = p.type === 'GRENADE' ? Config.PHYSICS.FRAG_RADIUS * 1.5 : 40;
                 
                 if (dist < dangerRadius) {
                     const isTeammate = p.team === this.team;
                     
                     if (p.type === 'GRENADE') {
                         // Variety in barks based on personality
                         // Incoming enemy frag: Panic (neuroticism) + Loudness (extraversion)
                         const panicShoutProb = (this.traits.neuroticism * 0.6) + (this.traits.extraversion * 0.3);
                         // Warning teammate: Altruism (agreeableness) + Loudness (extraversion)
                         const warningShoutProb = (this.traits.agreeableness * 0.7) + (this.traits.extraversion * 0.2);

                         if (p.ownerId === this.id) {
                            if (dist < 60 && Math.random() < (this.traits.extraversion * 0.8)) {
                                this.addBark("OOPS!");
                            }
                         } else if (isTeammate) {
                             if (Math.random() < warningShoutProb) {
                                 this.addBark(dist < 60 ? "WATCH IT!" : "FRAG!");
                             }
                         } else {
                             if (Math.random() < panicShoutProb) {
                                 this.addBark("GRENADE!");
                             }
                         }

                         // FORCE FLEE for frag
                         const angleFromGrenade = Utils.angle(p.pos, this.pos);
                         const bleedDist = 100;
                         this.currentAction = {
                            type: 'MOVE',
                            target: {
                                x: this.pos.x + Math.cos(angleFromGrenade) * bleedDist,
                                y: this.pos.y + Math.sin(angleFromGrenade) * bleedDist
                            }
                         };
                         this.path = []; 
                         this.moveTo(this.currentAction.target, dt, world, Config.AGENT.TURN_SPEED * 2, 1.5); 
                         this.state.update(dt, stressBaseline, true);
                         return;
                     } else if (p.type === 'SMOKE') {
                         // Smoke reaction: rarer barks, no panic fleeing
                         const smokeObserveProb = this.traits.extraversion * 0.3;
                         const teammateSmokeProb = (this.traits.extraversion * 0.1) + (this.traits.conscientiousness * 0.1);

                         if (Math.random() < smokeObserveProb && !isTeammate) {
                             this.addBark("SMOKE!");
                         } else if (Math.random() < teammateSmokeProb && isTeammate && dist < 50) {
                             this.addBark("SMOKING...");
                         }
                         
                         // Only move slightly if extremely close to avoid canister hit
                         if (dist < 30) {
                            const angleFromGrenade = Utils.angle(p.pos, this.pos);
                            this.pos.x += Math.cos(angleFromGrenade) * 2;
                            this.pos.y += Math.sin(angleFromGrenade) * 2;
                         }
                     }
                 }
            }
        }
        
        // 2. Social Battery Update
        // Use SpatialGrid for nearby check
        const nearby = world.spatial.query(this.pos.x, this.pos.y, 100).filter(a => a !== this && Utils.distance(this.pos, a.pos) < 100);

        if (nearby.length > 0) {
            // Fix: Everyone drains battery if crowded, but extraverts drain MUCH slower and introverts drain faster
            const drainMult = this.traits.extraversion < 0.5 ? (0.5 - this.traits.extraversion) : 0.01;
            this.state.socialBattery = Math.max(0, this.state.socialBattery - (dt * 0.01 * drainMult));
        } else {
            this.state.socialBattery = Math.min(Config.AGENT.MAX_SOCIAL, this.state.socialBattery + (dt * Config.AI.SOCIAL_REFILL_RATE));
        }

        // 2.5 Leadership Cowardice & Victory Checks
        if (this.rank === 0) {
            const leader = world.agents.find(a => a.team === this.team && a.rank === 1);
            if (leader && !leader.state.isDowned) {
                // COWARDICE: If I am fighting (Combat thought) but leader is retreating
                const iAmFighting = this.brain.currentThought === 'COMBAT';
                const leaderRetreating = leader.brain.currentThought === 'SURVIVAL'; // RETREAT action is in SURVIVAL thought
                
                if (iAmFighting && leaderRetreating) {
                    this.memory.modifyLeaderApproval(-Config.WORLD.APPROVAL_COWARDICE_PENALTY * (dt / 1000));
                }
            }
        }

        // 3. Sense (Throttled 10Hz)
        if (now >= this.nextScanTime) {
            this.sensory.scan(world);
            this.nextScanTime = now + 100;
        }
        
        this.memory.cleanup(world, dt);

        // 4. Think
        const action = this.brain.decide(world);
        if (this.currentAction && this.currentAction.type !== action.type) {
            this.retreatTarget = null;
            this.patrolTarget = null;
        }
        this.currentAction = action;

        // 5. Communicate
        this.communicate(world);

        // 6. Act
        this.executeAction(action, dt, world);

        // 7. Post-Action: Apply systematic jitter and update physical angle
        this.applyJitter(dt);
        
        // 8. Acoustic Stealth: Footstep Sounds
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

    takeDamage(amount, world = null) {
        this.state.takeDamage(amount);
        if (world && world.audio) world.audio.playHit();
        
        // CHANCE TO FREEZE (Shock)
        if (amount > 1 && Math.random() < Config.AGENT.FROZEN_PROB_PER_HIT) {
            this.state.isFrozenUntil = Date.now() + 1000 + (Math.random() * 1000);
            this.addBark("AAAGH!");
        }

        if (this.state.hp <= 0 && !this.state.isDead && !this.state.isDowned) {
             this.state.isDowned = true;
             this.state.hp = 1.0; // Gift some HP for the bleedout phase
             this.state.modifyMorale(-30);
        }
        if (world) this.react(world);
    }

    suppress(amount, world = null, sourcePos = null) {
        if (this.state.isDowned) return;
        
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
        const mult = 1.0 + (this.traits.neuroticism * 0.5);
        const oldSuppression = this.state.suppression;
        this.state.suppression = Math.min(100, this.state.suppression + amount * mult);
        this.state.modifyStress(amount * 0.2);

        // CHANCE TO FREEZE (Panic)
        if (this.state.stress > Config.AGENT.FROZEN_STRESS_THRESHOLD && Math.random() < 0.01) {
             this.state.isFrozenUntil = Date.now() + 1500;
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
        this.targetAngle = angle;
        
        if (snap) {
            this.angle = angle;
            return;
        }

        const diff = (this.targetAngle - this.angle + Math.PI) % (Math.PI * 2) - Math.PI;
        const normalizedDiff = diff < -Math.PI ? diff + Math.PI * 2 : diff;
        
        // Base turn speed from config, modified by neuroticism (reflexes)
        let maxTurn = Config.AGENT.MAX_TURN_SPEED * (dt / 16.6) * speedMult; 
        maxTurn *= (1 + this.traits.neuroticism * 0.5);

        // Apply turn cap
        const step = Utils.clamp(normalizedDiff, -maxTurn, maxTurn);
        this.angle += step;
    }

    applyJitter(dt) {
        if (this.state.stress > Config.AGENT.JITTER_THRESHOLD) {
            const intensity = (this.state.stress - Config.AGENT.JITTER_THRESHOLD) / 30;
            if (Math.random() < 0.1 * intensity) {
                this.targetAngle += (Math.random() - 0.5) * 0.2 * intensity;
            }
        }
    }

    react(world) {
        if (this.isReacting) return;
        
        // Throttling: Only react at most once every 200ms to prevent decision-storm lag
        const now = Date.now();
        if (now - this.lastReactionTime < 200) return;
        
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
        const cooldown = 3000;
        
        if (now - this.lastShoutTime < cooldown) return;

        const seesEnemy = this.sensory.scan(world).some(a => a.team !== this.team); 
        const isStressed = this.state.stress > 50;
        const isPinned = this.state.isPinned;
        const isWounded = this.state.hp < this.state.maxHp * 0.3 || this.state.isDowned;
        
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
                    this.addBark("NEED COVER!");
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

            allies.forEach(ally => {
                this.commLinks.push({ targetId: ally.id, timestamp: Date.now() });

                const trust = ally.memory.socialCredit.get(self.id) || 0.5;

                // Share Info
                ally.memory.syncHeatmap(self.memory.heatmap, trust);
                
                if (distressType) {
                    ally.memory.updateDistressSignal(self.id, distressType, self.pos, now, trust);
                }

                self.memory.knownHostiles.forEach(hostile => {
                    let reportedPos = hostile.lastKnownPosition;
                    
                    // NEUROTICISM: Chance to misreport or exaggerate positions
                    if (self.traits.neuroticism > 0.7 && Math.random() < 0.3) {
                         reportedPos = {
                             x: reportedPos.x + (Math.random() - 0.5) * 200,
                             y: reportedPos.y + (Math.random() - 0.5) * 200
                         };
                    }
                    ally.memory.updateHostile(hostile.id, reportedPos, hostile.timestamp, trust);
                    ally.react(world);
                });
            });
            
            this.commLinks = this.commLinks.filter(cl => (Date.now() - cl.timestamp) < 2000);
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
        const weapon = this.state.inventory.weapon;
        const now = Date.now();

        // 1. Reloading/Arming Logic
        if (this.state.reloadingUntil > now || this.armingUntil > now) return false;
        
        // NO SHOOTING WHILE SPRINTING
        if (this.movementMode === 'BOUNDING') return false;
        
        if (weapon.ammo <= 0) {
            if (weapon.carriedAmmo <= 0) return false; // Out of ammo completely

            // STRESS PENALTY: Reloading is slower when panicked
            const stressPenalty = 1.0 + (this.state.stress / 100) * (Config.AGENT.STRESS_RELOAD_MULT - 1.0);
            this.state.reloadingUntil = now + (Config.PHYSICS.RELOAD_TIME * stressPenalty);
            
            const refillAmount = Math.min(weapon.maxAmmo, weapon.carriedAmmo);
            weapon.ammo = refillAmount;
            weapon.carriedAmmo -= refillAmount;
            
            this.addBark("RELOADING!");
            return false;
        }

        // 2. Fire Rate Check
        if (now - this.state.lastFireTime < weapon.fireRate) return false;
        
        // 3. Friendly Fire Safety Check
        const distToTarget = Utils.distance(this.pos, targetPos);
        
        // COMBAT REALISM: Negligent Discharge
        // If stress is high, we might skip the safety check entirely (Tunnel Vision)
        const isNegligent = this.state.stress > Config.AGENT.FRIENDLY_FIRE_NEGLIGENCE_THRESHOLD && Math.random() < 0.5;
        
        // TRIGGER DISCIPLINE (Ambush Logic)
        if (this.state.inBush && !isNegligent) {
            // Only shoot if:
            // 1. Enemy is close (Ambush range)
            // 2. OR We are already compromised (High stress/suppression)
            // 3. OR We are a Gunner (No discipline)
            const ambushRange = this.role === 'BREACHER' ? 80 : 150;
            const compromised = this.state.stress > 30 || this.state.suppression > 10;
            
            if (distToTarget > ambushRange && !compromised && this.role !== 'GUNNER') {
                return false; // Hold fire!
            }
        }

        const checkStep = 20;
        const steps = Math.min(10, Math.ceil(distToTarget / checkStep)); // Check first 200px or so
        const fireAngle = Utils.angle(this.pos, targetPos);

        // Only perform safety check if NOT negligent
        if (!isNegligent) {
            for (let i = 1; i <= steps; i++) {
                const checkX = this.pos.x + Math.cos(fireAngle) * (i * checkStep);
                const checkY = this.pos.y + Math.sin(fireAngle) * (i * checkStep);
                
                // Query small radius at this point
                const friends = world.spatial.query(checkX, checkY, 20); // Broad phase
                const hasFriendly = friends.some(f => {
                    if (f.team !== this.team || f.id === this.id || f.isCover) return false;
                    // Precise Phase: Distance to line of fire
                    // Check if they are actually in the tube
                    const distToLine = Utils.distanceToSegment(f.pos, this.pos, {x: checkX, y: checkY}); // Check segment up to this point
                    return distToLine < (f.radius + 2); // 2px safety margin
                });
                
                if (hasFriendly) {
                   // FRIENDLY IN LOF! STOP!
                   this.addBark("CHECK FIRE!");
                   // Just hold fire and let the brain pick a new spot next frame if needed
                   return false;
                }
            }
        } else if (Math.random() < 0.05) {
             // 5% chance to bark if being negligent
             this.addBark("OUT OF MY WAY!");
        }

        // 4. Firing Arc Check
        // Allow wider arc for suppression (high inaccuracyMultiplier)
        const targetAngle = Utils.angle(this.pos, targetPos);
        const angleDiff = Math.abs((this.angle - targetAngle + Math.PI) % (Math.PI * 2) - Math.PI);
        const maxArc = inaccuracyMultiplier > 1.5 ? 0.8 : 0.6; 
        
        if (angleDiff > maxArc) return false;

        // 5. Fire!
        weapon.ammo--;
        this.state.lastFireTime = now;
        if (world && world.audio) world.audio.playGunshot();

        // ACCURACY CALCULATION
        // Base spread from weapon stats
        let spread = weapon.spread || 0.05;
        
        // Distance Falloff
        const optimalRange = weapon.optimalRange || 200;
        const falloffRate = weapon.falloff || 0.001;
        
        if (distToTarget > optimalRange) {
            spread += (distToTarget - optimalRange) * falloffRate;
        }

        // Modifiers
        const stressFactor = (this.state.stress / 100);
        const stressPenalty = stressFactor * Config.AGENT.STRESS_ACCURACY_MULT; // e.g. +0.3 rads at max stress
        const skillBonus = (this.traits.accuracyBase) * 0.02; // Minor skill reduction
        const movementPenalty = this.movementMode !== 'TACTICAL' && this.movementMode !== 'COVERING' ? 0.05 : 0.0;

        let totalInaccuracy = (spread + stressPenalty + movementPenalty - skillBonus) * inaccuracyMultiplier;
        
        // Clamp minimum spread
        totalInaccuracy = Math.max(0.01, totalInaccuracy);
        
        const shootAngle = this.angle + (Math.random() - 0.5) * totalInaccuracy;
        
        const forwardOffset = 22;
        const sideOffset = 6;
        const startX = this.pos.x + Math.cos(this.angle) * forwardOffset - Math.sin(this.angle) * sideOffset;
        const startY = this.pos.y + Math.sin(this.angle) * forwardOffset + Math.cos(this.angle) * sideOffset;

        const startingCovers = this.getCurrentCovers(world);

        const projectile = new Projectile(
            this.id,
            this.team,
            startX,
            startY,
            shootAngle,
            weapon.projectileSpeed,
            weapon.damage,
            'BULLET',
            startingCovers,
            null,
            weapon.visualType
        );
        world.projectiles.push(projectile);
        
        world.addSoundEvent(startX, startY, Config.PHYSICS.SOUND_RADIUS_GUNSHOT, 'GUNSHOT', this.id, this.team);
        return true;
    }

    calculateCurrentSpeed(world) {
        const modeConfig = Config.AGENT.MODES[this.movementMode] || Config.AGENT.MODES.TACTICAL;
        let baseSpeed = Config.AGENT.MOVE_SPEED * modeConfig.SPEED_MULT;
        
        // 1. Role Modifier
        baseSpeed *= this.state.speedMod;

        // 2. Stamina Modifier
        const staminaPercent = this.state.stamina / Config.AGENT.MAX_STAMINA;
        if (staminaPercent < 0.2) {
            baseSpeed *= 0.4; // Exhausted
            // Force out of sprint
            if (this.movementMode === 'BOUNDING') this.movementMode = 'TACTICAL';
        } else if (staminaPercent < 0.5) {
            const t = (staminaPercent - 0.2) / 0.3;
            baseSpeed *= (0.4 + t * 0.6); 
        }

        // 3. Stress Modifier (Adrenaline)
        if (this.state.stress > 90) baseSpeed *= 1.3; // Panic speed
        else if (this.state.stress > 60) baseSpeed *= 1.15; // Adrenaline

        // 4. Suppression Modifier
        baseSpeed *= (1 - (this.state.suppression / 200)); 

        // 5. HP Modifier
        const hpPercent = this.state.hp / this.state.maxHp;
        if (hpPercent < 0.3) baseSpeed *= 0.7; // Wounded

        // 6. Pinned Effect: Very slow crawl instead of 0
        if (this.state.isPinned) baseSpeed *= 0.1;

        // Bush Slowdown
        const gx = Math.floor(this.pos.x / Config.WORLD.GRID_SIZE);
        const gy = Math.floor(this.pos.y / Config.WORLD.GRID_SIZE);
        if (world.grid[gy] && world.grid[gy][gx] === 2) {
            baseSpeed *= 0.6;
        }

        return baseSpeed;
    }

    moveTo(targetPos, dt, world, turnSpeed = Config.AGENT.TURN_SPEED, speedMultiplier = 1.0, lookTarget = null) {
        // speedMultiplier arg is deprecated but kept for signature compat, ignored in favor of this.movementMode
        this.isMoving = true;
        
        // 1. Path Management
        const distToFinalTarget = Utils.distance(this.pos, targetPos);
        
        // Recalculate path if target changed or we don't have one
        if (!this.lastPathTarget || Utils.distance(this.lastPathTarget, targetPos) > 20) {
            // PASS HEATMAP FOR TACTICAL PATHFINDING
            // If Sneaking, prefer stealth paths (through bushes)
            const preferStealth = (this.movementMode === 'SNEAKING' || this.movementMode === 'COVERING');
            this.path = world.findPath(this.pos, targetPos, this.memory.heatmap, preferStealth);
            
            // Path Failure Check
            if (!this.path || this.path.length === 0) {
                 this.memory.markUnreachable(targetPos);
                 
                 if (this.currentAction && (this.currentAction.type === 'MOVE' || this.currentAction.type === 'RETREAT')) {
                     // Abort action to prevent being stuck looking at a wall
                     this.currentAction = { type: 'IDLE', score: 0 };
                     
                     // Only bark if we haven't barked about this recently (checked via unreachable memory?)
                     // Actually, just random is fine if we stop trying to go there.
                     if (Math.random() < 0.1) this.addBark("CAN'T GO THERE!");
                     
                     this.isMoving = false;
                     return;
                 }
            }

            this.lastPathTarget = { ...targetPos };
        }

        // If we have a path, head towards the next waypoint
        let activeTarget = targetPos;
        if (this.path && this.path.length > 0) {
            activeTarget = this.path[0];
            if (Utils.distance(this.pos, activeTarget) < 15) {
                this.path.shift();
                if (this.path.length > 0) activeTarget = this.path[0];
                else activeTarget = targetPos;
            }
        }

        // 2. Steering Behaviors
        let desiredX = activeTarget.x - this.pos.x;
        let desiredY = activeTarget.y - this.pos.y;
        
        // Separation (Formations: Skirmish Line)
        const neighbors = world.spatial.query(this.pos.x, this.pos.y, 60); // Increased radius for better spacing
        let sepX = 0;
        let sepY = 0;
        
        const avgEnemy = this.getAverageEnemyPos(world);
        let enemyAngle = 0;
        let hasEnemy = false;
        
        if (avgEnemy) {
            enemyAngle = Utils.angle(this.pos, avgEnemy);
            hasEnemy = true;
        }

        neighbors.forEach(n => {
            if (n !== this && n.team === this.team) {
                const dist = Utils.distance(this.pos, n.pos);
                if (dist < 50 && dist > 0) {
                    const pushStrength = (50 - dist) / 50; // Normalized push [0-1]
                    const angleToMe = Utils.angle(n.pos, this.pos);
                    
                    if (hasEnemy) {
                         // Skirmish Line Logic:
                         // We want to push APART relative to the enemy line of fire.
                         // Projected Separation: Push perpendicular to enemy direction.
                         // Also slight backward push to form a crescent if crowded.
                         
                         const relAngle = angleToMe - enemyAngle;
                         // If I'm to the "left" of the enemy line relative to my buddy, push further left.
                         // Normalize angle to -PI to PI
                         const normRel = Math.atan2(Math.sin(relAngle), Math.cos(relAngle));
                         
                         const perpAngle = enemyAngle + (normRel > 0 ? Math.PI/2 : -Math.PI/2);
                         
                         // Blend: 80% Perpendicular, 20% Radial (to prevent overlap)
                         sepX += (Math.cos(perpAngle) * 0.8 + Math.cos(angleToMe) * 0.2) * pushStrength;
                         sepY += (Math.sin(perpAngle) * 0.8 + Math.sin(angleToMe) * 0.2) * pushStrength;
                    } else {
                        // Standard radial separation if no enemy
                        sepX += Math.cos(angleToMe) * pushStrength;
                        sepY += Math.sin(angleToMe) * pushStrength;
                    }
                }
            }
        });

        // Normalize Desired Velocity
        const distToActive = Utils.distance(this.pos, activeTarget);
        if (distToActive > 0) {
            desiredX /= distToActive;
            desiredY /= distToActive;
        }

        // Combine and Smooth
        // Weight the separation lower than the intent
        const finalX = desiredX + sepX * 1.2;
        const finalY = desiredY + sepY * 1.2;
        
        const rawMoveAngle = Math.atan2(finalY, finalX);
        
        // Low-pass filter on the movement angle to kill high-frequency jitter
        this.smoothedMoveAngle = Utils.lerpAngle(this.smoothedMoveAngle, rawMoveAngle, 0.15);
        const moveAngle = this.smoothedMoveAngle;
        
        // Dynamic Speed Calculation
        const currentSpeed = this.calculateCurrentSpeed(world);
        let dist = currentSpeed * (dt / 1000);

        // Arrival Snapping: If we are extremely close to the target, just snap to it and stop moving.
        // This prevents infinite micro-wiggling.
        if (distToActive < 5) {
             dist = Math.min(dist, distToActive);
             if (distToActive < 1) {
                 this.isMoving = false;
                 return; 
             }
        }

        // Stamina Consumption
        const drainRate = Config.AGENT.MODES[this.movementMode].DRAIN;
        this.state.consumeStamina(drainRate * dt);

        // Movement Angle vs Looking Angle
        // If BOUNDING, force look aligned with move to simulate sprinting
        if (this.movementMode === 'BOUNDING') {
             this.rotateTowards(moveAngle, dt, Config.AGENT.MODES.BOUNDING.TURN_MULT);
        } else if (lookTarget) {
            const lookAngle = Utils.angle(this.pos, lookTarget);
            this.rotateTowards(lookAngle, dt, turnSpeed * 5); // Scale turnSpeed for the new system
        } else {
            // Body rotation follows the smoothed movement
            this.rotateTowards(moveAngle, dt, 0.5); 
        }
        
        const nextX = this.pos.x + Math.cos(moveAngle) * dist;
        const nextY = this.pos.y + Math.sin(moveAngle) * dist;

        // Improved Sliding Collision with Radius (Grid-Range Check)
        const rad = this.radius;
        const gridSize = world.gridSize;
        
        // Helper to check if a circle at (px, py) overlaps any wall/cover cells
        const isColliding = (px, py) => {
            const minGx = Math.floor((px - rad) / gridSize);
            const maxGx = Math.floor((px + rad) / gridSize);
            const minGy = Math.floor((py - rad) / gridSize);
            const maxGy = Math.floor((py + rad) / gridSize);

            for (let gy = minGy; gy <= maxGy; gy++) {
                for (let gx = minGx; gx <= maxGx; gx++) {
                    if (gx < 0 || gy < 0 || gy >= world.grid.length || gx >= world.grid[0].length) return true;
                    const cell = world.grid[gy][gx];
                    // 1=Wall, 3=Cover (Stone), 4=Cover (Wood)
                    if (cell === 1 || cell === 3 || cell === 4) return true;
                }
            }
            return false;
        };

        const willCollideDiag = isColliding(nextX, nextY);

        if (!willCollideDiag) {
            // Path is clear - move freely
            this.pos.x = nextX;
            this.pos.y = nextY;
        } else {
            // Diagonal is blocked - attempt sliding movement
            const canMoveX = !isColliding(nextX, this.pos.y);
            const canMoveY = !isColliding(this.pos.x, nextY);

            if (canMoveX && !canMoveY) {
                // Only X is clear - slide along X axis
                this.pos.x = nextX;
            } else if (canMoveY && !canMoveX) {
                // Only Y is clear - slide along Y axis
                this.pos.y = nextY;
            } else if (canMoveX && canMoveY) {
                // BOTH are clear individually but diagonal is blocked (Corner case)
                // Pick the axis with the larger velocity component to maximize movement
                const dx = Math.abs(Math.cos(moveAngle));
                const dy = Math.abs(Math.sin(moveAngle));
                if (dx > dy) {
                    this.pos.x = nextX;
                } else {
                    this.pos.y = nextY;
                }
            } else {
                // Both axes blocked - we are stuck
                this.isMoving = false;
                this.path = null;
                this.lastPathTarget = null;
            }
        }

        // Panic Recovery: If somehow already inside a wall/cover, push out to nearest clear space
        if (isColliding(this.pos.x, this.pos.y)) {
            const pushDist = dist * 2 + 1; // Minimum push to clear a cell boundary
            const directions = [
                {x: pushDist, y: 0}, {x: -pushDist, y: 0},
                {x: 0, y: pushDist}, {x: 0, y: -pushDist},
                {x: pushDist, y: pushDist}, {x: -pushDist, y: -pushDist}
            ];
            
            for (const dir of directions) {
                if (!isColliding(this.pos.x + dir.x, this.pos.y + dir.y)) {
                    this.pos.x += dir.x;
                    this.pos.y += dir.y;
                    break;
                }
            }
        }
    }

    executeAction(action, dt, world) {
        let turnSpeed = Config.AGENT.TURN_SPEED;

        // Pinned/Arming Effect: Cannot Move
        if (this.state.isPinned || this.armingUntil > Date.now()) {
            // Can still shoot but with high inaccuracy
            // Can rotate but slowly
            turnSpeed *= 0.5;
            // Force action to be effectively IDLE/DEFEND but we keep the logic below for shooting
            // Just clamp movement speed to 0
            if (Math.random() < 0.05) this.state.modifyStress(5); // Panic while pinned
            
            // If pinned, we might blind fire (SUPPRESS) instead of aimed fire
            if (action.type === 'ATTACK') action.type = 'SUPPRESS'; 
        }

        // Systematic Reflexive Behavior
        const isStressed = this.state.stress > 60;
        const canSnap = isStressed && Math.random() < Config.AGENT.PANIC_SNAP_PROB;

        if (action.type === 'ATTACK' || action.type === 'SUPPRESS') turnSpeed = 2.0;

        switch(action.type) {
            case 'IDLE':
                this.idleLookTimer -= dt;
                if (this.idleLookTimer <= 0) {
                    this.idleLookTimer = 2000 + Math.random() * 3000;
                    if (Math.random() < 0.4) {
                         this.targetAngle = this.angle + (Math.random() - 0.5) * 2; // Big scan
                    } else {
                         this.targetAngle = this.angle + (Math.random() - 0.5) * 0.5; // Small jitter
                    }
                }
                this.rotateTowards(this.targetAngle, dt, 0.2);
                break;
            case 'MOVE':
                if (action.target && !this.state.isPinned) this.moveTo(action.target, dt, world, turnSpeed);
                break;
            case 'LOOT':
                if (action.target) {
                    const dist = Utils.distance(this.pos, action.target);
                    if (Math.random() < 0.01) this.addBark("GETTING LOOT");
                    
                    if (dist < 30) {
                        // Support both direct reference and memory-copy matching
                        const idx = world.loot.findIndex(l => 
                            l === action.target || 
                            (l.x === action.target.x && l.y === action.target.y)
                        );
                        if (idx > -1) {
                            const item = world.loot.splice(idx, 1)[0];
                            console.log(`Agent ${this.id} picked up ${item.type} at ${item.x}, ${item.y}`);
                            this.state.morale = Math.min(100, this.state.morale + 15);
                            this.targetPos = null;
                            
                            // Remove from my own memory so I don't try to loop back if re-evaluating
                            this.memory.knownLoot = this.memory.knownLoot.filter(l => l.x !== item.x || l.y !== item.y);

                            if (item.type === 'Medkit') {
                                // Add to medical bag if we have one, or just heal
                                const kits = this.state.inventory.utility.find(u => u.type === 'Medkit');
                                if (kits) kits.count += 2; // Refill 2 kits
                                this.state.hp = Math.min(this.state.maxHp, this.state.hp + 2); // Also immediate heal
                            } else if (item.type === 'WeaponCrate') {
                                this.state.inventory.weapon = { 
                                    type: 'Fast Gun', range: 500, projectileSpeed: 700, fireRate: 300, 
                                    damage: 2, ammo: 60, maxAmmo: 60, carriedAmmo: 120, spread: 0.04
                                };
                                // Bonus frag for finding a crate
                                const frags = this.state.inventory.utility.find(u => u.type === 'FragGrenade');
                                if (frags) frags.count++;
                            } else if (item.type === 'AmmoCrate') {
                                // Refill magazine and add 2 spare magazines
                                const weapon = this.state.inventory.weapon;
                                weapon.ammo = weapon.maxAmmo;
                                weapon.carriedAmmo += (weapon.maxAmmo * 2);
                                
                                // Resupply 1 of each utility item
                                this.state.inventory.utility.forEach(u => u.count++);
                            }
                        }
                    } else {
                        this.moveTo(action.target, dt, world, turnSpeed);
                    }
                }
                break;
            case 'THROW':
                // GRENADE HANDLING IMPROVEMENT: MULTI-STEP AIMING & ARMING
                const gType = action.grenadeType || 'FragGrenade';
                const gIdx = this.state.inventory.utility.findIndex(u => u.type === gType && u.count > 0);
                
                if (gIdx > -1 && action.target) {
                    const now = Date.now();
                    
                    // 1. Check if we are already in the arming process
                    if (this.armingUntil === 0) {
                        this.armingUntil = now + Config.PHYSICS.GRENADE_ARM_TIME;
                        this.armingAction = action;
                        this.addBark(gType === 'SmokeGrenade' ? "DEPLOYING SMOKE!" : "PREPPING FRAG!");
                        return; // Wait for next frames
                    }

                    // 2. Rotate to target during arming
                    const targetAngle = Utils.angle(this.pos, action.target);
                    const turnSpeedBonus = 2.0; 
                    this.rotateTowards(targetAngle, dt, turnSpeed * turnSpeedBonus, canSnap);

                    // 3. Check if done arming
                    if (now >= this.armingUntil) {
                        // Throw!
                        this.state.inventory.utility[gIdx].count--;
                        this.lastThrowTime = now;
                        this.armingUntil = 0;
                        this.armingAction = null;
                        
                        this.addBark(gType === 'SmokeGrenade' ? "SMOKE OUT!" : "FRAG OUT!");
                        
                        const pType = (gType === 'SmokeGrenade') ? 'SMOKE' : 'GRENADE';
                        const pRadius = (pType === 'SMOKE') ? Config.PHYSICS.SMOKE_RADIUS : Config.PHYSICS.FRAG_RADIUS;
                        const startingCovers = this.getCurrentCovers(world);

                        // Throw from hand (offset sideways and slightly forward)
                        const handForwardOffset = 10;
                        const handSideOffset = 8;
                        const throwX = this.pos.x + Math.cos(this.angle) * handForwardOffset - Math.sin(this.angle) * handSideOffset;
                        const throwY = this.pos.y + Math.sin(this.angle) * handForwardOffset + Math.cos(this.angle) * handSideOffset;

                        // PRECISION AIMING: The projectile now knows its destination
                        const p = new Projectile(
                            this.id, this.team, throwX, throwY, 
                            this.angle, 0, pRadius, pType,
                            startingCovers, action.target
                        );
                        
                        // COOKING LOGIC: If target is close, the fuse is already partially depleted
                        const dist = Utils.distance(this.pos, action.target);
                        if (dist < 150) {
                             p.fuse -= 1000; // Cook for 1s to prevent them from running away
                        }

                        p.damage = (pType === 'SMOKE') ? 0 : Config.PHYSICS.FRAG_DAMAGE; 
                        world.projectiles.push(p);
                    }
                } else {
                    this.armingUntil = 0;
                    this.armingAction = null;
                }
                break;
            case 'SELF_HEAL':
                {
                    const medkitIdx = this.state.inventory.utility.findIndex(u => u.type === 'Medkit' && u.count > 0);
                    if (medkitIdx > -1) {
                        this.state.inventory.utility[medkitIdx].count--;
                        const healingAmount = this.role === 'MEDIC' ? this.state.maxHp : this.state.maxHp * 0.5;
                        this.state.hp = Math.min(this.state.maxHp, this.state.hp + healingAmount);
                        this.state.isDowned = false;
                        this.state.modifyStress(-30);
                        this.addBark("APPLYING FIRST AID");
                    }
                }
                break;
            case 'HEAL':
                if (action.targetId) {
                    const patient = world.agents.find(a => a.id === action.targetId);
                    if (patient && Utils.distance(this.pos, patient.pos) < 35) {
                        const medkitIdx = this.state.inventory.utility.findIndex(u => u.type === 'Medkit' && u.count > 0);
                        if (medkitIdx > -1) {
                            // Consume Medkit
                            this.state.inventory.utility[medkitIdx].count--;

                            // Apply Role-Based Healing
                            const isMedic = this.role === 'MEDIC';
                            const healingAmount = isMedic ? patient.state.maxHp : patient.state.maxHp * 0.6;
                            
                            patient.state.hp = Math.min(patient.state.maxHp, patient.state.hp + healingAmount);
                            patient.state.isDowned = false; 
                            patient.state.modifyStress(isMedic ? -50 : -25);
                            patient.state.fatigue = Math.max(0, patient.state.fatigue - (isMedic ? 20 : 10));

                            // Social & Feedback
                            if (isMedic) {
                                this.addBark("YOU'RE GOOD!");
                                patient.addBark("THANKS DOC!");
                            } else {
                                this.addBark("PATCHING YOU UP!");
                                patient.addBark("THANKS!");
                            }
                            
                            this.memory.modifyTrust(patient.id, 0.4);
                            patient.memory.modifyTrust(this.id, 0.4);
                            
                            // Remove signal
                            this.memory.distressSignals.delete(patient.id);
                        } else {
                            this.addBark("I'M OUT!");
                            this.memory.distressSignals.delete(patient.id);
                        }
                    } else if (patient) {
                        this.moveTo(patient.pos, dt, world, turnSpeed);
                    }
                }
                break;
            case 'RESUPPLY':
                if (action.targetId) {
                    const source = world.agents.find(a => a.id === action.targetId);
                    if (source && Utils.distance(this.pos, source.pos) < 30) {
                        const myWeapon = this.state.inventory.weapon;
                        const sourceWeapon = source.state.inventory.weapon;
                        
                                                // Transfer logic: donor gives 2 magazines from carriedAmmo
                                                const transferAmount = myWeapon.maxAmmo * 2;
                                                if (sourceWeapon.carriedAmmo > 0) {
                                                    const actualTransfer = Math.min(sourceWeapon.carriedAmmo, transferAmount);
                                                    sourceWeapon.carriedAmmo -= actualTransfer;
                                                    myWeapon.carriedAmmo += actualTransfer;
                        
                                                    // Successful logistics increases trust
                                                    this.memory.modifyTrust(source.id, 0.05);
                                                }                    }
                }
                break;
            case 'ATTACK':
                let finalTargetPos = null;
                if (action.targetId) {
                    const target = world.agents.find(a => a.id === action.targetId);
                    const memoryTarget = this.memory.knownHostiles.find(h => h.id === action.targetId);
                    finalTargetPos = target ? target.pos : (memoryTarget ? memoryTarget.lastKnownPosition : null);
                } else if (action.target) {
                    finalTargetPos = action.target;
                }

                if (finalTargetPos) {
                    const dist = Utils.distance(this.pos, finalTargetPos);
                    const hasLOS = world.hasLineOfSight(this.pos, finalTargetPos); 
                    const hasClearShot = world.hasLineOfSight(this.pos, finalTargetPos, Infinity, true);
                    const inRange = dist <= this.state.inventory.weapon.range;

                    if (hasLOS) {
                        const targetAngle = Utils.angle(this.pos, finalTargetPos);
                        this.rotateTowards(targetAngle, dt, turnSpeed, canSnap); 
                        
                        // ONLY FIRE IF THE SHOT IS CLEAR
                        if (inRange && hasClearShot) {
                            this.shootAt(finalTargetPos, world);
                        } else if (inRange && !hasClearShot && !action.moveTarget && !this.state.isPinned) {
                            // IF SHOT IS BLOCKED: Try to "peek" by moving slightly to the side
                            const angleToTarget = Utils.angle(this.pos, finalTargetPos);
                            const peekAngle = angleToTarget + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2);
                            const peekDist = 30 + Math.random() * 40;
                            action.moveTarget = {
                                x: this.pos.x + Math.cos(peekAngle) * peekDist,
                                y: this.pos.y + Math.sin(peekAngle) * peekDist
                            };
                        }
                        
                        if (action.moveTarget) this.moveTo(action.moveTarget, dt, world, turnSpeed, 1.0, finalTargetPos);
                        else if (dist > 150) this.moveTo(finalTargetPos, dt, world, turnSpeed, 1.0, finalTargetPos);
                    } else {
                        // NO VISION: Move to last known position
                        this.moveTo(finalTargetPos, dt, world, turnSpeed);
                    }
                }
                break;
            case 'SUPPRESS':
                if (action.target) {
                    const dist = Utils.distance(this.pos, action.target);
                    // Use standard LoS check to determine if the suppression path is blocked by hard cover
                    // (Note: This also blocks on bushes, which is fine for tactical peeking)
                    const hasClearShot = world.hasLineOfSight(this.pos, action.target, Infinity, true);

                    if (dist > 150) {
                        this.moveTo(action.target, dt, world, turnSpeed, 1.0, action.target);
                    } else if (!hasClearShot && !this.state.isPinned) {
                        // Suppression is also blocked by cover now, so adjust
                        const angleToTarget = Utils.angle(this.pos, action.target);
                        const peekAngle = angleToTarget + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2);
                        this.moveTo({
                            x: this.pos.x + Math.cos(peekAngle) * 40,
                            y: this.pos.y + Math.sin(peekAngle) * 40
                        }, dt, world, turnSpeed, 1.0, action.target);
                    } else {
                        const targetAngle = Utils.angle(this.pos, action.target);
                        this.rotateTowards(targetAngle, dt, turnSpeed, canSnap);
                    }

                    if (hasClearShot) {
                        this.shootAt(action.target, world, 4.0); 
                    }
                }
                break;
            case 'RETREAT':
                 const visibleHostiles = this.sensory.scan(world).filter(a => a.team !== this.team);
                 let retreatLookTarget = null;
                 
                 // COWARDICE: If I retreat while allies are nearby and fighting, they lose trust
                 const alliesFighting = world.agents.some(a => 
                    a.team === this.team && a !== this && a.currentAction && 
                    (a.currentAction.type === 'ATTACK' || a.currentAction.type === 'SUPPRESS') &&
                    Utils.distance(this.pos, a.pos) < 150
                 );
                 if (alliesFighting) {
                    world.agents.forEach(a => {
                        if (a.team === this.team && a !== this && Utils.distance(this.pos, a.pos) < 200 && a.memory) {
                            a.memory.modifyTrust(this.id, -0.05);
                        }
                    });
                 }

                 if (visibleHostiles.length > 0) {
                     visibleHostiles.sort((a, b) => Utils.distance(this.pos, a.pos) - Utils.distance(this.pos, b.pos));
                     retreatLookTarget = visibleHostiles[0].pos;
                     this.shootAt(retreatLookTarget, world, 2.5);
                     turnSpeed = 4.0; // Fast rotation to keep eyes on threat
                 }

                 if (action.target) {
                     this.retreatTarget = action.target;
                 } else if (!this.retreatTarget) {
                    const avgEnemy = this.getAverageEnemyPos(world);
                    if (avgEnemy) {
                        const runAngle = Utils.angle(avgEnemy, this.pos);
                        const dist = 150;
                        const target = {
                            x: Utils.clamp(this.pos.x + Math.cos(runAngle) * dist, 20, world.width - 20),
                            y: Utils.clamp(this.pos.y + Math.sin(runAngle) * dist, 20, world.height - 20)
                        };
                        this.retreatTarget = target;
                    } else {
                        this.retreatTarget = this.getSquadCenter(world);
                    }
                 }

                 if (this.retreatTarget) {
                    const distToTarget = Utils.distance(this.pos, this.retreatTarget);
                    // Pass retreatLookTarget to moveTo so they face the enemy while moving away
                    this.moveTo(this.retreatTarget, dt, world, turnSpeed, Config.AGENT.RUN_SPEED_MULTIPLIER, retreatLookTarget);
                    
                    if (distToTarget < 20) { 
                        const threat = this.getAverageEnemyPos(world);
                        if (threat) this.rotateTowards(Utils.angle(this.pos, threat), dt, turnSpeed, true);
                        this.retreatTarget = null;
                        this.path = [];
                    }
                 }
                break;
            case 'MUTINY':
                const leader = world.agents.find(a => a.team === this.team && a.rank === 1);
                if (leader) {
                    // Turn to face the leader
                    const angleToLeader = Utils.angle(this.pos, leader.pos);
                    this.rotateTowards(angleToLeader, dt, turnSpeed * 2);

                    // Challenge Logic (Execute once)
                    if (Math.random() < 0.05) { // Slow chance per frame
                        this.addBark("I'M TAKING OVER!");
                        
                        // Compare Potential
                        // Challenger gets a bonus for having the guts (Ambition)
                        const challengeScore = this.traits.leadershipPotential * 1.2;
                        const defenseScore = leader.traits.leadershipPotential * (leader.state.morale / 100); // Demoralized leaders are weak
                        
                        if (challengeScore > defenseScore) {
                            // SUCCESSFUL COUP
                            leader.rank = 0;
                            leader.addBark("Fine, lead us!");
                            leader.memory.leaderApproval = 50; // Reset resentment
                            
                            this.rank = 1;
                            this.addBark("FOLLOW ME!");
                            this.memory.leaderApproval = 100; // I love myself
                            
                            // Boost squad morale (New Hope)
                            world.agents.forEach(a => {
                                if (a.team === this.team && a !== this && a !== leader) {
                                    a.state.modifyMorale(20);
                                    a.addBark("YES SIR!");
                                }
                            });
                        } else {
                            // FAILED COUP
                            this.addBark("Sorry sir...");
                            this.memory.leaderApproval = 10; // Still hate them
                            this.state.modifyStress(30); // Humiliated
                        }
                        // Reset thought to avoid infinite loop
                        this.brain.currentThought = 'IDLE'; 
                    }
                }
                break;
        }

        this.pos.x = Utils.clamp(this.pos.x, 0, world.width);
        this.pos.y = Utils.clamp(this.pos.y, 0, world.height);
    }
}
